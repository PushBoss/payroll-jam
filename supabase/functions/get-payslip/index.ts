import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get token from request
    let token: string;
    
    try {
      const body = await req.json();
      token = body.token;
    } catch (jsonError) {
      console.error('Failed to parse request body:', jsonError);
      return new Response(
        JSON.stringify({ error: 'Invalid request body. Expected JSON with "token" field.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Decode token
    let decoded: { employeeId: string; runId: string; period: string }
    try {
      decoded = JSON.parse(atob(token))
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Invalid token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { employeeId, runId } = decoded

    if (!employeeId || !runId) {
      return new Response(
        JSON.stringify({ error: 'Invalid token data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client with SERVICE ROLE key (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Fetch pay run
    console.log('🔍 Fetching pay run:', { runId, employeeId })
    
    const { data: payRun, error: payRunError } = await supabaseAdmin
      .from('pay_runs')
      .select('*')
      .eq('id', runId)
      .single()

    console.log('📊 Pay run query result:', {
      found: !!payRun,
      error: payRunError ? JSON.stringify(payRunError) : 'none',
      runId
    })

    if (payRunError) {
      console.error('❌ Error fetching pay run:', {
        error: payRunError,
        message: payRunError.message,
        code: payRunError.code,
        details: payRunError.details,
        hint: payRunError.hint
      })
      return new Response(
        JSON.stringify({ 
          error: 'Pay run not found',
          details: payRunError.message,
          runId 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!payRun) {
      console.warn('⚠️ Pay run query succeeded but returned no data')
      return new Response(
        JSON.stringify({ error: 'Pay run not found', runId }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('✅ Pay run found:', {
      id: payRun.id,
      status: payRun.status,
      lineItemCount: payRun.line_items?.length || 0
    })

    // Find line item for this employee
    const lineItems = payRun.line_items || []
    const lineItem = lineItems.find((item: any) => item.employeeId === employeeId)

    if (!lineItem) {
      return new Response(
        JSON.stringify({ error: 'Payslip not found for this employee' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch employee info
    const { data: employee, error: employeeError } = await supabaseAdmin
      .from('employees')
      .select('id, company_id, first_name, last_name, email')
      .eq('id', employeeId)
      .single()

    if (employeeError || !employee) {
      console.error('Error fetching employee:', employeeError)
      return new Response(
        JSON.stringify({ error: 'Employee not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch company info
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('name')
      .eq('id', employee.company_id)
      .single()

    if (companyError || !company) {
      console.error('Error fetching company:', companyError)
      return new Response(
        JSON.stringify({ error: 'Company not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return payslip data
    const response = {
      success: true,
      data: {
        lineItem: lineItem,
        companyName: company.name,
        payPeriod: payRun.period_start,
        payDate: payRun.pay_date
      }
    }

    return new Response(
      JSON.stringify(response),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error: any) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
