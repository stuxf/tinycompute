export const metadata = {
  title: "TinyCompute",
  description: "Pay-per-minute cloud compute via micropayments",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
