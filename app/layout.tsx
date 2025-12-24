import "./globals.css";

export const metadata = {
  title: "Vision Narrator MVP",
  description: "Browser camera → AI vision → live narration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
