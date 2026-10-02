using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace OptimizeAll.Infrastructure.Sqlite.Migrations
{
    /// <inheritdoc />
    public partial class AddSitemapVisibility : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "SeoHideFromSitemap",
                table: "website_services",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "SeoHideFromSitemap",
                table: "website_partners",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "SeoHideFromSitemap",
                table: "website_pages",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "SeoHideFromSitemap",
                table: "website_industries",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "SeoHideFromSitemap",
                table: "website_case_studies",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "SeoHideFromSitemap",
                table: "website_blog_posts",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "HideFromSitemap",
                table: "learning_courses",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "NoIndex",
                table: "learning_courses",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "HideFromSitemap",
                table: "landing_pages",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SeoHideFromSitemap",
                table: "website_services");

            migrationBuilder.DropColumn(
                name: "SeoHideFromSitemap",
                table: "website_partners");

            migrationBuilder.DropColumn(
                name: "SeoHideFromSitemap",
                table: "website_pages");

            migrationBuilder.DropColumn(
                name: "SeoHideFromSitemap",
                table: "website_industries");

            migrationBuilder.DropColumn(
                name: "SeoHideFromSitemap",
                table: "website_case_studies");

            migrationBuilder.DropColumn(
                name: "SeoHideFromSitemap",
                table: "website_blog_posts");

            migrationBuilder.DropColumn(
                name: "HideFromSitemap",
                table: "learning_courses");

            migrationBuilder.DropColumn(
                name: "NoIndex",
                table: "learning_courses");

            migrationBuilder.DropColumn(
                name: "HideFromSitemap",
                table: "landing_pages");
        }
    }
}
