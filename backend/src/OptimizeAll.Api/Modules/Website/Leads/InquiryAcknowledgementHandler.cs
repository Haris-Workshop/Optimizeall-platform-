using OptimizeAll.Api.Common.Events;
using OptimizeAll.Api.Common.Notifications;
using OptimizeAll.Api.Modules.Notifications.Templates;
using OptimizeAll.Domain.Events;
using OptimizeAll.Domain.Website;

namespace OptimizeAll.Api.Modules.Website.Leads;

/// <summary>
/// Emails the visitor a receipt (with the request reference) when they send the contact form, a free audit request or a
/// quote request, so they are not left with only the page they were on. Consultation bookings send their own
/// confirmation. A failed send is logged and never fails the submission.
/// </summary>
public sealed class InquiryAcknowledgementHandler(IEmailSender email, EmailTemplateService templates, ILogger<InquiryAcknowledgementHandler> logger)
    : IEventHandler<WebsiteInquiryReceived>
{
    public async Task HandleAsync(WebsiteInquiryReceived e, CancellationToken ct)
    {
        var (kind, reply) = e.InquiryType switch
        {
            nameof(InquiryType.Contact) => ("message", "within one business day"),
            nameof(InquiryType.Audit) => ("free audit request", "within two business days"),
            nameof(InquiryType.Quote) => ("quote request", "within two business days"),
            _ => (null, null),
        };
        if (kind is null || reply is null) return;
        try
        {
            var mail = await templates.RenderAsync(EmailTemplateCatalog.InquiryReceived, new Dictionary<string, string>
            {
                ["name"] = e.Name,
                ["kind"] = kind,
                ["reply"] = reply,
                ["reference"] = LeadReference.For(e.InquiryId),
            }, ct);
            var result = await email.SendAsync(new EmailMessage(e.Email, e.Name, mail.Subject, mail.Text), ct);
            if (!result.Success) logger.LogWarning("Receipt for inquiry {InquiryId} failed: {Error}", e.InquiryId, result.Error);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Receipt for inquiry {InquiryId} failed", e.InquiryId);
        }
    }
}
