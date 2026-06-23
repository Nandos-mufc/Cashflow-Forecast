import "./globals.css";
import { AuthProvider } from "../lib/AuthProvider";

export const metadata = {
  title: "Meridian",
  description: "Cashflow forecasting for international and expat financial advisers.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
