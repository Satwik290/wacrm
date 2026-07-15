import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const USER_ID = 'bbeec88b-e48b-450a-a45f-700cef6fe4b7'

async function run() {
  const { data: { user }, error } = await supabaseAdmin.auth.admin.getUserById(USER_ID)
  if (error) {
    console.error("Error fetching user:", error)
  } else {
    console.log("User still exists in auth.users:")
    console.log({
      id: user?.id,
      email: user?.email,
      role: user?.role,
      last_sign_in_at: user?.last_sign_in_at,
    })
  }

  const { data: profile, error: pErr } = await supabaseAdmin.from('profiles').select('*').eq('user_id', USER_ID).maybeSingle()
  if (pErr) {
    console.error("Error fetching profile:", pErr)
  } else {
    console.log("Profile still exists in public.profiles:")
    console.log(profile)
  }
}

run()
