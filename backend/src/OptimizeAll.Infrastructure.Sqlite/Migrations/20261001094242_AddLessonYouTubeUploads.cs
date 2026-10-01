using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OptimizeAll.Infrastructure.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddLessonYouTubeUploads : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "YouTubePlaylistId",
                table: "learning_courses",
                type: "TEXT",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "lesson_youtube_uploads",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CourseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    LessonSlug = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    StoredFileId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ThumbnailFileId = table.Column<Guid>(type: "TEXT", nullable: true),
                    FileName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    RequestedByUserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Privacy = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    PublishAfterReady = table.Column<bool>(type: "INTEGER", nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    YouTubeVideoId = table.Column<string>(type: "TEXT", maxLength: 11, nullable: true),
                    Error = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    ErrorCode = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    Notice = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    UploadedAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: true),
                    UploadAttempts = table.Column<int>(type: "INTEGER", nullable: false),
                    NextAttemptAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: true),
                    LeaseUntil = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: true),
                    PlaylistItemAdded = table.Column<bool>(type: "INTEGER", nullable: false),
                    ActualPrivacy = table.Column<string>(type: "TEXT", maxLength: 40, nullable: true),
                    ConcurrencyStamp = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_lesson_youtube_uploads", x => x.Id);
                    table.ForeignKey(
                        name: "FK_lesson_youtube_uploads_learning_courses_CourseId",
                        column: x => x.CourseId,
                        principalTable: "learning_courses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_lesson_youtube_uploads_CourseId_LessonSlug",
                table: "lesson_youtube_uploads",
                columns: new[] { "CourseId", "LessonSlug" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_lesson_youtube_uploads_Status_NextAttemptAt",
                table: "lesson_youtube_uploads",
                columns: new[] { "Status", "NextAttemptAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "lesson_youtube_uploads");

            migrationBuilder.DropColumn(
                name: "YouTubePlaylistId",
                table: "learning_courses");
        }
    }
}
