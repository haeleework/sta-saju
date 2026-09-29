import ServiceShell from "./service-shell";

export default function Page() {
  const authTestMode = process.env.AUTH_TEST_MODE === "true";
  return (
    <main className="site-shell">
      <ServiceShell authTestMode={authTestMode} />
    </main>
  );
}
