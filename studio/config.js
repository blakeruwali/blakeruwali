// Public Supabase settings for the dashboard. The anon key is safe to publish: every table is
// behind row-level security and only the owner account can read. Never put a service key here.
(function () {
  const local = location.hostname === "127.0.0.1" || location.hostname === "localhost";
  window.STUDIO_CONFIG = local
    ? {
        // `supabase start` defaults for this repo (supabase/config.toml, port 56321).
        supabaseUrl: "http://127.0.0.1:56321",
        supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
      }
    : {
        // Supabase project social-hq (BLK org). Anon key only: public by design, RLS gates every read.
        supabaseUrl: "https://khzavycdaguhwynsecbd.supabase.co",
        supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoemF2eWNkYWd1aHd5bnNlY2JkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3MjY3NTYsImV4cCI6MjExMDMwMjc1Nn0.Mm2RhtT-I2m6IxUnuyoC8kbRwZlsICDPD0j-ntlHHXA",
      };
})();
