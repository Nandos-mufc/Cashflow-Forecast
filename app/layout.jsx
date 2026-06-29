import "./globals.css";
import { AuthProvider } from "../lib/AuthProvider";

export const metadata = {
  title: "Meridian",
  description: "Cashflow forecasting for international and expat financial advisers.",
};

// Apply the theme before first paint so login + dashboard are dark from the start (the app default),
// while still honouring a user who has explicitly chosen light. Runs synchronously in <head> to avoid
// a flash of the wrong theme on load. Reads the same key RunwayApp persists ("meridian_theme").
const themeBootScript = `(function(){try{var t=localStorage.getItem("meridian_theme");document.documentElement.setAttribute("data-theme",(t==="light"||t==="dark")?t:"dark");}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
