using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;
using OptimizeAll.Api.Modules.Files;
using OptimizeAll.Domain.Common;
using OptimizeAll.Domain.Files;

namespace OptimizeAll.Api.Modules.Learning.YouTubeUploads;

/// <summary>Identifies lecture video containers by their first bytes; the file name and Content-Type are never trusted.</summary>
public static class VideoSniffer
{
    public const int HeadBytes = 64;

    // Other ISO base media files share the "ftyp" box: HEIF/AVIF images, audio-only MP4 and camera RAW are not videos.
    private static readonly HashSet<string> NotVideoBrands = new(StringComparer.Ordinal)
    {
        "heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1", "avif", "avis", "M4A ", "M4B ", "M4P ", "crx ", "jp2 ", "jpm ", "jpx ",
    };

    /// <summary>MP4/MOV (ISO base media "ftyp" box at offset 4) or WebM (EBML header 1A 45 DF A3).</summary>
    public static (string ContentType, string Extension)? Identify(ReadOnlySpan<byte> head)
    {
        if (head.Length >= 12 && head[4] == (byte)'f' && head[5] == (byte)'t' && head[6] == (byte)'y' && head[7] == (byte)'p')
        {
            var brand = Encoding.ASCII.GetString(head.Slice(8, 4));
            if (NotVideoBrands.Contains(brand)) return null;
            return brand == "qt  " ? ("video/quicktime", ".mov") : ("video/mp4", ".mp4");
        }
        if (head.Length >= 4 && head[0] == 0x1A && head[1] == 0x45 && head[2] == 0xDF && head[3] == 0xA3) return ("video/webm", ".webm");
        return null;
    }
}

/// <summary>A file the intake wrote to private storage (the caller owns the blob until it is saved as a StoredFile).</summary>
public sealed record StagedFile(string StorageKey, string ContentType, long SizeBytes, string Sha256, string FileName);

public sealed record StagedUpload(StagedFile Video, StagedFile? Thumbnail, string? Privacy, bool Publish);

/// <summary>
/// Reads the multipart body of a lecture upload as a stream: the video goes straight into private storage (never buffered
/// whole in memory), its type is checked by magic bytes and its size against the limit while it is copied.
/// Fields: <c>file</c> (required), <c>privacy</c>, <c>publish</c>, <c>thumbnail</c> (PNG or JPEG, ≤ 2 MB).
/// </summary>
public sealed class YouTubeUploadIntake(IFileStorage storage, TimeProvider clock)
{
    public const long MaxThumbnailBytes = 2 * 1024 * 1024;

    public async Task<StagedUpload> ReadAsync(Stream body, string? contentType, long maxVideoBytes, CancellationToken ct)
    {
        if (!MediaTypeHeaderValue.TryParse(contentType, out var media) ||
            !media.MediaType.Equals("multipart/form-data", StringComparison.OrdinalIgnoreCase) ||
            HeaderUtilities.RemoveQuotes(media.Boundary).Value is not { Length: > 0 and <= 200 } boundary)
            throw new DomainException("file.required", "Send the video as multipart/form-data with a 'file' part.");

        StagedFile? video = null, thumbnail = null;
        string? privacy = null;
        var publish = false;
        try
        {
            var reader = new MultipartReader(boundary, body);
            while (await NextSectionAsync(reader, ct) is { } section)
            {
                if (!ContentDispositionHeaderValue.TryParse(section.ContentDisposition, out var disposition)) continue;
                switch (HeaderUtilities.RemoveQuotes(disposition.Name).Value)
                {
                    case "file":
                        if (video is not null) throw new DomainException("file.duplicate", "Send exactly one video file.");
                        video = await StageVideoAsync(section, disposition, maxVideoBytes, ct);
                        break;
                    case "thumbnail":
                        if (thumbnail is not null) throw new DomainException("file.duplicate", "Send at most one thumbnail.");
                        thumbnail = await StageThumbnailAsync(section, disposition, ct);
                        break;
                    case "privacy":
                        privacy = (await ReadFieldAsync(section, ct)).Trim();
                        break;
                    case "publish":
                        publish = bool.TryParse((await ReadFieldAsync(section, ct)).Trim(), out var p) && p;
                        break;
                }
            }
            if (video is null) throw new DomainException("file.required", "Choose a video file to upload.");
            return new StagedUpload(video, thumbnail, string.IsNullOrWhiteSpace(privacy) ? null : privacy, publish);
        }
        catch (BadHttpRequestException ex) when (ex.StatusCode == StatusCodes.Status413PayloadTooLarge)
        {
            // The server's request-body limit was hit while the body was still being read.
            Discard(video);
            Discard(thumbnail);
            throw new DomainException("file.too_large", $"Videos can be at most {FormatSize(maxVideoBytes)}.");
        }
        catch
        {
            Discard(video);
            Discard(thumbnail);
            throw;
        }
    }

    /// <summary>The next part; a body that is not well-formed multipart (truncated, no closing boundary) is a 400, not a server error.</summary>
    private static async Task<MultipartSection?> NextSectionAsync(MultipartReader reader, CancellationToken ct)
    {
        try
        {
            return await reader.ReadNextSectionAsync(ct);
        }
        catch (Exception ex) when (ex is InvalidDataException or IOException && ex is not OperationCanceledException and not BadHttpRequestException)
        {
            throw new DomainException("request.invalid_multipart", "The upload could not be read; send the video as multipart/form-data.");
        }
    }

    public void Discard(StagedFile? file)
    {
        if (file is null) return;
        try { storage.Delete(file.StorageKey); } catch (IOException) { }
    }

    private async Task<StagedFile> StageVideoAsync(MultipartSection section, ContentDispositionHeaderValue disposition, long max, CancellationToken ct)
    {
        var head = new byte[VideoSniffer.HeadBytes];
        var read = await section.Body.ReadAtLeastAsync(head, head.Length, throwOnEndOfStream: false, ct);
        if (read == 0) throw new DomainException("file.empty", "The uploaded file is empty.");
        var kind = VideoSniffer.Identify(head.AsSpan(0, read))
                   ?? throw new DomainException("file.unsupported_type", "Upload an MP4, MOV or WebM video.");
        var key = storage.NewKey(clock.GetUtcNow().UtcDateTime, kind.Extension);
        using var counted = new CountingStream(head.AsMemory(0, read), section.Body, max);
        try
        {
            await storage.WriteAsync(key, counted, ct);
        }
        catch (UploadTooLargeException)
        {
            throw new DomainException("file.too_large", $"Videos can be at most {FormatSize(max)}.");
        }
        return new StagedFile(key, kind.ContentType, counted.Total, counted.Sha256Hex,
            FileService.SanitizeFileName(FileName(disposition), kind.Extension));
    }

    private async Task<StagedFile?> StageThumbnailAsync(MultipartSection section, ContentDispositionHeaderValue disposition, CancellationToken ct)
    {
        using var buffer = new MemoryStream();
        await using var limited = new CountingStream(ReadOnlyMemory<byte>.Empty, section.Body, MaxThumbnailBytes);
        try
        {
            await limited.CopyToAsync(buffer, ct);
        }
        catch (UploadTooLargeException)
        {
            throw new DomainException("file.thumbnail_too_large", "The thumbnail can be at most 2 MB.");
        }
        if (buffer.Length == 0) return null; // an empty file input
        var bytes = buffer.ToArray();
        var info = ImageInspector.Inspect(bytes);
        if (info is null || info.Extension == ".webp")
            throw new DomainException("file.unsupported_type", "The thumbnail must be a PNG or JPEG image.");
        var key = storage.NewKey(clock.GetUtcNow().UtcDateTime, info.Extension);
        await storage.WriteAsync(key, bytes, ct);
        return new StagedFile(key, info.ContentType, bytes.Length, Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(),
            FileService.SanitizeFileName(FileName(disposition), info.Extension));
    }

    private static string FileName(ContentDispositionHeaderValue d) =>
        HeaderUtilities.RemoveQuotes(d.FileName.HasValue ? d.FileName : d.FileNameStar).Value ?? string.Empty;

    private static async Task<string> ReadFieldAsync(MultipartSection section, CancellationToken ct)
    {
        using var reader = new StreamReader(section.Body, Encoding.UTF8, false, 256, leaveOpen: true);
        var buffer = new char[65];
        var n = await reader.ReadBlockAsync(buffer.AsMemory(), ct);
        return n > 64 ? throw new DomainException("request.invalid_field", "A form field is too long.") : new string(buffer, 0, n);
    }

    private static string FormatSize(long bytes) => bytes >= 1L << 30 ? $"{bytes / (double)(1L << 30):0.#} GB" : $"{bytes / (double)(1L << 20):0.#} MB";

    private sealed class UploadTooLargeException : Exception;

    /// <summary>Reads <c>head</c> then <c>inner</c>, counts and hashes what it hands out and refuses to pass <c>max</c> bytes.</summary>
    private sealed class CountingStream(ReadOnlyMemory<byte> head, Stream inner, long max) : Stream
    {
        private readonly IncrementalHash _hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        private int _headOffset;

        public long Total { get; private set; }
        public string Sha256Hex => Convert.ToHexString(_hash.GetHashAndReset()).ToLowerInvariant();

        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken ct = default)
        {
            int n;
            if (_headOffset < head.Length)
            {
                n = Math.Min(buffer.Length, head.Length - _headOffset);
                head.Slice(_headOffset, n).CopyTo(buffer);
                _headOffset += n;
            }
            else
            {
                n = await inner.ReadAsync(buffer, ct);
            }
            if (n == 0) return 0;
            Total += n;
            if (Total > max) throw new UploadTooLargeException();
            _hash.AppendData(buffer.Span[..n]);
            return n;
        }

        public override Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken ct) => ReadAsync(buffer.AsMemory(offset, count), ct).AsTask();
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
        public override void Flush() { }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

        protected override void Dispose(bool disposing)
        {
            if (disposing) _hash.Dispose();
            base.Dispose(disposing);
        }
    }
}
