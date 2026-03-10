import { describe, test, expect } from "bun:test";
import { detect, apply, preview, DEFAULT_CONFIG, type StatuslineConfig } from "./setup";

describe("statusline/setup", () => {
  describe("detect", () => {
    test("returns detection result structure", () => {
      const result = detect();
      expect(result).toHaveProperty("has_settings");
      expect(result).toHaveProperty("has_statusline");
      expect(result).toHaveProperty("current_command");
      expect(result).toHaveProperty("is_juhbdi");
      expect(result).toHaveProperty("is_ccstatusline");
      expect(result).toHaveProperty("is_other");
      expect(result).toHaveProperty("settings_path");
      expect(result).toHaveProperty("statusline_path");
    });

    test("settings_path points to ~/.claude/settings.json", () => {
      const result = detect();
      expect(result.settings_path).toContain(".claude");
      expect(result.settings_path).toEndWith("settings.json");
    });

    test("statusline_path points to ~/.claude/juhbdi-statusline.cjs", () => {
      const result = detect();
      expect(result.statusline_path).toEndWith("juhbdi-statusline.cjs");
    });
  });

  describe("DEFAULT_CONFIG", () => {
    test("has all fields enabled by default", () => {
      expect(DEFAULT_CONFIG.right_align).toBe(true);
      expect(DEFAULT_CONFIG.mood_colors).toBe(true);
      expect(DEFAULT_CONFIG.trust_badge).toBe(true);
      expect(DEFAULT_CONFIG.git_branch).toBe(true);
      expect(DEFAULT_CONFIG.cost_display).toBe(true);
      expect(DEFAULT_CONFIG.context_bar).toBe(true);
    });
  });

  describe("preview", () => {
    test("returns ANSI string with JuhBDI branding", () => {
      const result = preview(DEFAULT_CONFIG);
      expect(result).toContain("JuhBDI");
    });

    test("includes trust badge when enabled", () => {
      const result = preview({ ...DEFAULT_CONFIG, trust_badge: true });
      expect(result).toContain("[P]");
    });

    test("excludes trust badge when disabled", () => {
      const result = preview({ ...DEFAULT_CONFIG, trust_badge: false });
      expect(result).not.toContain("[P]");
    });

    test("includes git branch when enabled", () => {
      const result = preview({ ...DEFAULT_CONFIG, git_branch: true });
      expect(result).toContain("main");
    });

    test("excludes git branch when disabled", () => {
      const result = preview({ ...DEFAULT_CONFIG, git_branch: false });
      expect(result).not.toContain("main");
    });

    test("includes cost when enabled", () => {
      const result = preview({ ...DEFAULT_CONFIG, cost_display: true });
      expect(result).toContain("$1.23");
    });

    test("excludes cost when disabled", () => {
      const result = preview({ ...DEFAULT_CONFIG, cost_display: false });
      expect(result).not.toContain("$1.23");
    });

    test("includes context bar when enabled", () => {
      const result = preview({ ...DEFAULT_CONFIG, context_bar: true });
      expect(result).toContain("35%");
    });

    test("excludes context bar when disabled", () => {
      const result = preview({ ...DEFAULT_CONFIG, context_bar: false });
      expect(result).not.toContain("35%");
    });

    test("works with all options disabled", () => {
      const config: StatuslineConfig = {
        right_align: false,
        mood_colors: false,
        trust_badge: false,
        git_branch: false,
        cost_display: false,
        context_bar: false,
      };
      const result = preview(config);
      expect(result).toContain("JuhBDI");
      expect(result).toContain("Claude Opus 4.6");
    });
  });

  describe("apply", () => {
    test("fails gracefully when source script is missing", () => {
      // With no CLAUDE_PLUGIN_ROOT set to a valid path, should fail gracefully
      const originalRoot = process.env.CLAUDE_PLUGIN_ROOT;
      process.env.CLAUDE_PLUGIN_ROOT = "/nonexistent/path";
      const result = apply(DEFAULT_CONFIG);
      expect(result.success).toBe(false);
      expect(result.message).toContain("not found");
      process.env.CLAUDE_PLUGIN_ROOT = originalRoot;
    });
  });
});
