#!/usr/bin/env node

/**
 * Supabase Schema Deployment Script
 * 
 * This script helps deploy the database schema to Supabase
 * using the Supabase Management API or SQL execution
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

// Load environment variables from .env.local manually
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    return {};
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=:#]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      env[key] = value;
    }
  });
  
  return env;
}

const env = loadEnvFile();

const SUPABASE_PROJECT_REF = 'arqbxlaudfbmiqvwwmnt';
const SUPABASE_URL = env.VITE_SUPABASE_URL || `https://${SUPABASE_PROJECT_REF}.supabase.co`;
const SUPABASE_SERVICE_KEY = env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const SCHEMA_FILE = './supabase_schema_complete.sql';

async function deploySchema() {
  console.log('🚀 Payroll Jam - Database Schema Deployment\n');
  
  // Check if schema file exists
  if (!fs.existsSync(SCHEMA_FILE)) {
    console.error('❌ Schema file not found:', SCHEMA_FILE);
    process.exit(1);
  }

  // Read schema file
  const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
  console.log('✅ Schema file loaded:', SCHEMA_FILE);
  console.log(`📊 Schema size: ${(schema.length / 1024).toFixed(2)} KB\n`);

  // Check environment variables
  if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ VITE_SUPABASE_SERVICE_ROLE_KEY not found in .env.local');
    console.log('\n📝 To deploy the schema:');
    console.log('1. Go to https://supabase.com/dashboard/project/' + SUPABASE_PROJECT_REF);
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy the contents of ' + SCHEMA_FILE);
    console.log('4. Paste and execute in SQL Editor\n');
    process.exit(1);
  }

  console.log('🔗 Connecting to Supabase...');
  console.log('   Project:', SUPABASE_PROJECT_REF);
  console.log('   URL:', SUPABASE_URL);

  // Execute schema via REST API
  try {
    const result = await executeSQL(schema);
    console.log('\n✅ Schema deployed successfully!');
    console.log('📋 Tables created:', result.tableCount || 'Unknown');
    console.log('\n🎉 Database is ready for use!\n');
  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    console.log('\n📝 Manual deployment instructions:');
    console.log('1. Go to https://supabase.com/dashboard/project/' + SUPABASE_PROJECT_REF);
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy the contents of ' + SCHEMA_FILE);
    console.log('4. Paste and execute in SQL Editor\n');
    process.exit(1);
  }
}

async function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });
    
    const options = {
      hostname: `${SUPABASE_PROJECT_REF}.supabase.co`,
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve({ success: true, tableCount: 'Multiple' });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// Run the deployment
deploySchema();
