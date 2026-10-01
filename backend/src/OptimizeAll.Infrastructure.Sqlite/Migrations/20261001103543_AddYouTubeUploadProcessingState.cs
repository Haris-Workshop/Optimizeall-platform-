using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OptimizeAll.Infrastructure.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddYouTubeUploadProcessingState : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "PollAttempts",
                table: "lesson_youtube_uploads",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "ProcessingSince",
                table: "lesson_youtube_uploads",
                type: "TEXT",
                precision: 6,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "UploadMayExist",
                table: "lesson_youtube_uploads",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PollAttempts",
                table: "lesson_youtube_uploads");

            migrationBuilder.DropColumn(
                name: "ProcessingSince",
                table: "lesson_youtube_uploads");

            migrationBuilder.DropColumn(
                name: "UploadMayExist",
                table: "lesson_youtube_uploads");
        }
    }
}
