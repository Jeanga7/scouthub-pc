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
  space: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px", "2xl": "32px", "3xl": "48px", "4xl": "64px" },
  radius: { control: "6px", card: "10px", panel: "16px", pill: "999px" },
  shadow: { subtle: "0 1px 2px #1020330D", elevated: "0 8px 24px #10203312" },
  breakpoint: { mobile: "640px", tablet: "1024px", contentMax: "1200px" },
  zIndex: { base: 0, sticky: 10, topbar: 20, sheet: 30, modal: 40, toast: 50 },
  motion: { fast: "120ms", normal: "180ms", sheet: "240ms" }
} as const;

export type ScoutHubDesignTokens = typeof scoutHubDesignTokens;
