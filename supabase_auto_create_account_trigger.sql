-- =====================================================
-- AUTO-CREATE ACCOUNT ON USER SIGNUP
-- =====================================================

-- This trigger automatically creates an account record when a user signs up
-- It uses the user's metadata to populate account details

CREATE OR REPLACE FUNCTION create_account_on_user_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.accounts (
    owner_id, 
    email, 
    company_name,
    subscription_plan,
    created_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'companyName', NEW.email || '''s Company'),
    COALESCE(NEW.raw_user_meta_data->>'plan', 'Free'),
    NOW()
  )
  ON CONFLICT (owner_id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_create_account_on_user_signup ON auth.users;

-- Create trigger on auth.users table
CREATE TRIGGER trigger_create_account_on_user_signup
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION create_account_on_user_signup();

-- Add unique constraint on owner_id to prevent duplicates
ALTER TABLE public.accounts 
ADD CONSTRAINT accounts_owner_id_unique UNIQUE (owner_id);

COMMENT ON FUNCTION create_account_on_user_signup IS 'Automatically creates an account record when a user signs up in Supabase Auth';
