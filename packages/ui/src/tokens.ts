export const scoutHubDesignTokens = {
  color: {
    brand950: "#071A33",
    brand800: "#123B68",
    brand600: "#1769AA",
    brand100: "#E8F2FA",
    surface: "#FFFFFF",
    canvas: "#F6F8FB",
    border: "#DCE4EC",
    text: "#102033",
    muted: "#5E6D7E",
    success: "#19764A",
    warning: "#B06A00",
    danger: "#B42318"
  },
  typography: {
    fontFamily: { ui: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
    fontSize: { metadata: "0.75rem", body: "1rem", lead: "1.125rem", title: "1.75rem", display: "3.5rem" },
    fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
    lineHeight: { tight: 1.15, normal: 1.5, relaxed: 1.6 },
    letterSpacing: { tight: "-0.02em", normal: "0", wide: "0.04em" }
  },
  space: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "32px", "3xl": "48px", "4xl": "64px" },
  radius: { control: "6px", card: "10px", panel: "16px", pill: "999px" },
  shadow: { subtle: "0 1px 2px #1020330D", elevated: "0 8px 24px #10203312" },
  breakpoint: { mobile: "640px", tablet: "1024px", contentMax: "1200px" },
  zIndex: { base: 0, sticky: 10, topbar: 20, sheet: 30, modal: 40, toast: 50 },
  motion: { fast: "120ms", normal: "180ms", sheet: "240ms" },
  focus: { ringColor: "#1769AA", ringWidth: "3px", ringOffset: "2px" },
  control: { minTouchSize: "44px" }
} as const;

export type ScoutHubDesignTokens = typeof scoutHubDesignTokens;
