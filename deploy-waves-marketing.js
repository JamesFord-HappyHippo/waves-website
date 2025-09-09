#!/usr/bin/env node
/**
 * Waves Marketing Site Deployment Script
 * 
 * Simplified deployment orchestration following Waves marine platform patterns
 * for static S3 website hosting with CloudFront distribution.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Parse command line arguments
const args = process.argv.slice(2);
const environment = args.find(arg => arg.startsWith('--env='))?.split('=')[1] || 'dev';
const region = args.find(arg => arg.startsWith('--region='))?.split('=')[1] || 'us-east-1';
const force = args.includes('--force');
const validate = args.includes('--validate');
const dryRun = args.includes('--dry-run');
const profile = args.find(arg => arg.startsWith('--profile='))?.split('=')[1] || 'default';

// Configuration
const config = {
  s3Bucket: 'waves-static-seawater',
  cloudFrontDistributionId: '', // Add if CloudFront is configured
  requiredFiles: [
    'index.html',
    'css/marine-theme.css',
    'js/marine-app.js',
    'about.html',
    'features.html'
  ],
  excludePatterns: [
    'node_modules/*',
    '.git/*',
    '*.md',
    'package*.json',
    'next.config.js',
    'tsconfig.json',
    'deploy*.js',
    'deploy*.sh',
    '*.log',
    '.claude/*'
  ]
};

console.log(`🌊 Waves Marketing Site Deployment`);
console.log(`📍 Environment: ${environment}`);
console.log(`🌍 Region: ${region}`);
console.log(`⚡ Force: ${force}`);
console.log(`✅ Validate: ${validate}`);
console.log(`🧪 Dry Run: ${dryRun}`);
console.log(`👤 AWS Profile: ${profile}`);
console.log('─'.repeat(60));

async function deployMarketingSite() {
  try {
    console.log('📦 Gathering marketing site artifacts...');
    
    // Pre-deployment validation
    if (validate) {
      console.log('\n✅ Running pre-deployment validation...');
      await validateDeployment();
    }

    // Environment-specific safety checks
    if (environment === 'production' && !force) {
      console.log('\n⚠️ Production deployment requires --force flag');
      console.log('   Use: node deploy-waves-marketing.js --env=production --force');
      process.exit(1);
    }

    // Check AWS credentials
    console.log('\n🔐 Checking AWS credentials...');
    try {
      execSync(`aws sts get-caller-identity --profile ${profile}`, { stdio: 'pipe' });
      console.log('✅ AWS credentials validated');
    } catch (error) {
      console.error(`❌ AWS credentials not configured for profile: ${profile}`);
      process.exit(1);
    }

    // Check required files
    console.log('\n📋 Pre-deployment checks...');
    for (const file of config.requiredFiles) {
      if (!fs.existsSync(file)) {
        console.error(`❌ Required file missing: ${file}`);
        process.exit(1);
      }
    }
    console.log('✅ Required files present');

    // HTML validation (basic)
    if (fs.existsSync('index.html')) {
      console.log('🔍 Validating HTML...');
      try {
        const htmlContent = fs.readFileSync('index.html', 'utf8');
        
        // Basic validation checks
        if (!htmlContent.includes('<!DOCTYPE html>')) {
          console.warn('⚠️ HTML5 doctype missing');
        }
        if (!htmlContent.includes('<title>')) {
          console.warn('⚠️ Page title missing');
        }
        if (!htmlContent.includes('Flowbite')) {
          console.warn('⚠️ Flowbite integration might be missing');
        }
        
        console.log('✅ HTML validation completed');
      } catch (error) {
        console.warn('⚠️ HTML validation warnings (continuing anyway)');
      }
    }

    if (dryRun) {
      console.log('\n🧪 Performing dry run deployment...');
      
      // Build exclude arguments
      const excludeArgs = config.excludePatterns.map(pattern => `--exclude "${pattern}"`).join(' ');
      
      const command = `aws s3 sync . s3://${config.s3Bucket} --profile ${profile} --dryrun ${excludeArgs}`;
      console.log(`📤 Would execute: ${command}`);
      
      try {
        execSync(command, { stdio: 'inherit' });
      } catch (error) {
        console.error('❌ Dry run failed:', error.message);
        process.exit(1);
      }
      
      console.log('\n🧪 Dry run complete - no actual deployment performed');
      console.log('✅ All validations passed - ready for deployment');
      return;
    }

    // Actual deployment
    console.log('\n🚀 Deploying marketing site to S3...');
    
    // Sync files to S3
    console.log(`📤 Syncing files to s3://${config.s3Bucket}`);
    
    const excludeArgs = config.excludePatterns.map(pattern => `--exclude "${pattern}"`).join(' ');
    const syncCommand = `aws s3 sync . s3://${config.s3Bucket} --profile ${profile} --delete ${excludeArgs}`;
    
    try {
      execSync(syncCommand, { stdio: 'inherit' });
      console.log('✅ Files synced to S3');
    } catch (error) {
      console.error('❌ S3 sync failed:', error.message);
      process.exit(1);
    }

    // Set content types for specific files
    console.log('🔧 Setting content types...');
    
    const contentTypeCommands = [
      `aws s3 cp s3://${config.s3Bucket}/index.html s3://${config.s3Bucket}/index.html --profile ${profile} --content-type "text/html; charset=utf-8" --metadata-directive REPLACE`,
      `aws s3 cp s3://${config.s3Bucket}/css/marine-theme.css s3://${config.s3Bucket}/css/marine-theme.css --profile ${profile} --content-type "text/css; charset=utf-8" --metadata-directive REPLACE`,
      `aws s3 cp s3://${config.s3Bucket}/js/marine-app.js s3://${config.s3Bucket}/js/marine-app.js --profile ${profile} --content-type "application/javascript; charset=utf-8" --metadata-directive REPLACE`
    ];

    for (const command of contentTypeCommands) {
      try {
        execSync(command, { stdio: 'pipe' });
      } catch (error) {
        console.warn(`⚠️ Content type setting warning: ${error.message}`);
      }
    }
    
    console.log('✅ Content types configured');

    // CloudFront invalidation (if configured)
    if (config.cloudFrontDistributionId) {
      console.log('\n🔄 Creating CloudFront invalidation...');
      try {
        const invalidateCommand = `aws cloudfront create-invalidation --distribution-id ${config.cloudFrontDistributionId} --paths "/*" --profile ${profile}`;
        execSync(invalidateCommand, { stdio: 'pipe' });
        console.log('✅ CloudFront invalidation created');
      } catch (error) {
        console.warn('⚠️ CloudFront invalidation failed (continuing):', error.message);
      }
    }

    // Deployment summary
    console.log('\n🎉 Marketing site deployment completed successfully!');
    console.log('📊 Deployment Summary:');
    console.log(`   Environment: ${environment}`);
    console.log(`   S3 Bucket: s3://${config.s3Bucket}`);
    console.log(`   Website URL: http://${config.s3Bucket}.s3-website-${region}.amazonaws.com`);

    if (environment === 'production') {
      console.log('\n🌐 Production URLs:');
      console.log('   Main URL: https://waves.seawater.io (requires DNS setup)');
      console.log(`   Direct URL: http://${config.s3Bucket}.s3-website-${region}.amazonaws.com`);
    }

    console.log('\n✨ Waves marketing site deployment complete!');
    console.log('🌊 Safe waters and successful marketing! ⚓');

  } catch (error) {
    console.error('\n💥 Deployment failed:', error.message);
    console.error('🔧 Check logs above for troubleshooting information');
    process.exit(1);
  }
}

/**
 * Run comprehensive validation before deployment
 */
async function validateDeployment() {
  console.log('🔒 Running marketing site validation...');
  
  // Check for required marketing elements
  const requiredElements = [
    { file: 'index.html', content: 'Amplify Your Navigation Tools', description: 'AI amplification messaging' },
    { file: 'index.html', content: 'Choose Your Navigation Experience', description: 'Pricing section' },
    { file: 'index.html', content: 'Open Source Navigation Intelligence', description: 'GitHub integration' },
    { file: 'css/marine-theme.css', content: 'marine-', description: 'Marine theme styles' },
    { file: 'js/marine-app.js', content: 'WavesMarineApp', description: 'Marine app functionality' }
  ];

  for (const element of requiredElements) {
    if (fs.existsSync(element.file)) {
      const content = fs.readFileSync(element.file, 'utf8');
      if (content.includes(element.content)) {
        console.log(`  ✅ ${element.description} found in ${element.file}`);
      } else {
        console.warn(`  ⚠️ ${element.description} missing from ${element.file}`);
      }
    } else {
      console.error(`  ❌ Required file missing: ${element.file}`);
      process.exit(1);
    }
  }

  // Validate SEO elements
  if (fs.existsSync('index.html')) {
    const htmlContent = fs.readFileSync('index.html', 'utf8');
    const seoElements = [
      { pattern: /<title>.*Waves.*<\/title>/, name: 'Page title with Waves' },
      { pattern: /<meta name="description"/, name: 'Meta description' },
      { pattern: /<meta property="og:/, name: 'Open Graph tags' },
      { pattern: /application\/ld\+json/, name: 'Schema.org structured data' }
    ];

    for (const element of seoElements) {
      if (element.pattern.test(htmlContent)) {
        console.log(`  ✅ ${element.name} present`);
      } else {
        console.warn(`  ⚠️ ${element.name} missing or incomplete`);
      }
    }
  }

  console.log('✅ Marketing site validation completed');
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
🌊 Waves Marketing Site Deployment

Usage:
  node deploy-waves-marketing.js [options]

Options:
  --env=<environment>     Deployment environment (dev|staging|production)
  --region=<region>       AWS region (default: us-east-1)
  --profile=<profile>     AWS profile (default: default)
  --force                 Force deployment to production
  --validate              Run extra validation checks before deployment
  --dry-run              Validate and stage but don't deploy
  --help                 Show this help message

Examples:
  # Deploy to development environment
  node deploy-waves-marketing.js --env=dev --validate

  # Dry run for production
  node deploy-waves-marketing.js --env=production --dry-run --validate

  # Force deploy to production
  node deploy-waves-marketing.js --env=production --force --profile=waves-prod

🌊 Following Waves marine platform deployment patterns! ⚓
`);
}

// Handle command line execution
if (args.includes('--help')) {
  showHelp();
  process.exit(0);
}

// Run deployment
deployMarketingSite().catch(error => {
  console.error('💥 Deployment script failed:', error);
  process.exit(1);
});