using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OptimizeAll.Infrastructure.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddTwoFactorAuthentication : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "two_factor_challenges",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Kind = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Method = table.Column<string>(type: "TEXT", maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: false),
                    Attempts = table.Column<int>(type: "INTEGER", nullable: false),
                    ConsumedAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: true),
                    SecurityVersion = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_two_factor_challenges", x => x.Id);
                    table.ForeignKey(
                        name: "FK_two_factor_challenges_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_recovery_codes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CodeHash = table.Column<string>(type: "TEXT", fixedLength: true, maxLength: 64, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: false),
                    UsedAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_recovery_codes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_user_recovery_codes_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "user_two_factor",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SecretCiphertext = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: false),
                    EnabledAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: true),
                    LastUsedTimeStep = table.Column<long>(type: "INTEGER", nullable: false),
                    LastUsedAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: true),
                    FailedAttempts = table.Column<int>(type: "INTEGER", nullable: false),
                    LockoutEndsAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: true),
                    RecoveryCodesGeneratedAt = table.Column<DateTime>(type: "TEXT", precision: 6, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_two_factor", x => x.Id);
                    table.ForeignKey(
                        name: "FK_user_two_factor_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_two_factor_challenges_ExpiresAt",
                table: "two_factor_challenges",
                column: "ExpiresAt");

            migrationBuilder.CreateIndex(
                name: "IX_two_factor_challenges_UserId_CreatedAt",
                table: "two_factor_challenges",
                columns: new[] { "UserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_user_recovery_codes_UserId_CodeHash",
                table: "user_recovery_codes",
                columns: new[] { "UserId", "CodeHash" });

            migrationBuilder.CreateIndex(
                name: "IX_user_two_factor_UserId",
                table: "user_two_factor",
                column: "UserId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "two_factor_challenges");

            migrationBuilder.DropTable(
                name: "user_recovery_codes");

            migrationBuilder.DropTable(
                name: "user_two_factor");
        }
    }
}
