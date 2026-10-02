using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using OptimizeAll.Domain.Identity;

namespace OptimizeAll.Infrastructure.Persistence.Configurations;

internal sealed class UserTwoFactorConfiguration : IEntityTypeConfiguration<UserTwoFactor>
{
    public void Configure(EntityTypeBuilder<UserTwoFactor> b)
    {
        b.ToTable("user_two_factor");
        b.Property(x => x.SecretCiphertext).HasMaxLength(1000).IsRequired();
        b.HasIndex(x => x.UserId).IsUnique();
        b.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class UserRecoveryCodeConfiguration : IEntityTypeConfiguration<UserRecoveryCode>
{
    public void Configure(EntityTypeBuilder<UserRecoveryCode> b)
    {
        b.ToTable("user_recovery_codes");
        b.Property(x => x.CodeHash).HasMaxLength(64).IsFixedLength().IsRequired();
        b.HasIndex(x => new { x.UserId, x.CodeHash });
        b.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class TwoFactorChallengeConfiguration : IEntityTypeConfiguration<TwoFactorChallenge>
{
    public void Configure(EntityTypeBuilder<TwoFactorChallenge> b)
    {
        b.ToTable("two_factor_challenges");
        b.Property(x => x.Method).HasMaxLength(16).IsRequired();
        b.HasIndex(x => new { x.UserId, x.CreatedAt });
        b.HasIndex(x => x.ExpiresAt);
        b.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}
