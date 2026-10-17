/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Field green: primary actions, selected states, "Ready".
        green: {
          DEFAULT: "#1D5638",
          900: "#0F3A25",
          300: "#A9C2B1",
          100: "#E2EDE5",
          50: "#F0F5F1",
        },
        // Ochre: reserved for sources, links and keyboard focus.
        ochre: {
          DEFAULT: "#94540A",
          700: "#7A4408",
          800: "#6E3E06",
          100: "#F8EBD3",
          50: "#FDF7EC",
          mark: "#F9DFA6",
          line: "#EBD3A8",
          divider: "#F1E4CB",
          toast: "#F2C98A",
        },
        // Slate info: "not found" answers and "Processing".
        info: {
          DEFAULT: "#34485C",
          ink: "#22313F",
          dot: "#4A6380",
          line: "#D8DEE6",
          100: "#ECEFF3",
        },
        danger: {
          DEFAULT: "#A8322B",
          700: "#8A2620",
          900: "#6E1E19",
          100: "#F8E4E1",
          50: "#FFFAF9",
          toast: "#F2A79F",
        },
        paper: "#F7F5F0",
        subtle: "#FBFAF7",
        chip: "#EFEBE3",
        line: { DEFAULT: "#E3DED4", strong: "#CBC4B6" },
        ink: { DEFAULT: "#1C1B17", body: "#3A3832", 2: "#545048", 3: "#6B665C" },
        scrim: "rgba(20,24,20,0.45)",
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "system-ui", "-apple-system", "'Segoe UI'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,27,23,0.04), 0 12px 32px rgba(28,27,23,0.06)",
        composer: "0 1px 2px rgba(28,27,23,0.04), 0 8px 24px rgba(28,27,23,0.05)",
        dialog: "0 24px 48px rgba(15,20,15,0.25)",
        sheet: "0 -12px 32px rgba(15,20,15,0.2)",
        toast: "0 8px 24px rgba(15,20,15,0.18)",
      },
      keyframes: {
        blink: { "0%,49%": { opacity: "1" }, "50%,100%": { opacity: "0" } },
        pulsedot: { "0%,100%": { opacity: ".35" }, "50%": { opacity: "1" } },
        spin: { to: { transform: "rotate(360deg)" } },
      },
      animation: {
        blink: "blink 1s infinite",
        pulsedot: "pulsedot 1.2s infinite",
        spin: "spin 0.9s linear infinite",
      },
    },
  },
  plugins: [],
};
