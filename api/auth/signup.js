// /api/auth/signup.js
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { name, email, password, age, phone } = req.body;

  if (!name || !email || !password || !age || !phone) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        full_name: name,
        age,
        phone_number: phone,
        onboarding_complete: false,
      },
    });

    if (error) throw error;

    return res.status(200).json({ user: data.user });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
