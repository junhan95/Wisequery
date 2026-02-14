# WiseQuery RAG System Test Guide

This guide explains how to test the RAG (Retrieval-Augmented Generation) system functionality.

## Test Files

Three sample files have been created for testing:

1. **techcorp_company_profile.txt** - Company information
   - Founded: March 15, 2015 by Dr. Kim Min-jun and Sarah Chen
   - Location: Seoul, South Korea
   - Employees: 847 people

2. **smartwidget_product_specs.txt** - Product specifications
   - Version: 4.2.1
   - System Requirements: 16GB RAM minimum, 8 CPU cores
   - Pricing: $500-$5,000/month

3. **techcorp_faq.txt** - Frequently asked questions
   - 99.9% uptime guarantee
   - 14-day free trial available
   - 15 languages supported

---

## Testing Steps

### Step 1: Login
1. Open the application at https://your-app-url
2. Login with your account (Google, email, or other methods)

### Step 2: Create a Test Project
1. Click the "+" button in the sidebar to create a new project
2. Name it something like "RAG Test Project"

### Step 3: Upload Test Files
1. Navigate to your test project
2. Use the file upload feature (paperclip icon or drag-and-drop)
3. Upload all three .txt files from the `test_files/` directory
4. Wait for the files to finish processing (chunking status should show "completed")

### Step 4: Create a Conversation and Test RAG

Start a new conversation and ask the following questions to verify RAG is working:

#### Test Question 1 (Company Info):
> "Who founded TechCorp and when was it founded?"

**Expected Answer Should Include:**
- Dr. Kim Min-jun and Sarah Chen
- March 15, 2015 (or just 2015)
- Seoul, South Korea

#### Test Question 2 (Product Specs):
> "What are the system requirements for SmartWidget?"

**Expected Answer Should Include:**
- RAM: Minimum 16GB, Recommended 64GB
- CPU: 8 cores minimum, 16 cores recommended
- Storage: 500GB SSD minimum
- Operating System: Linux Ubuntu 20.04+ or Windows Server 2019+

#### Test Question 3 (FAQ Content):
> "What is the uptime guarantee and how can I contact support?"

**Expected Answer Should Include:**
- 99.9% uptime guarantee
- Email: support@techcorp.example.com
- Phone: +82-2-1234-5678

#### Test Question 4 (Cross-file Search):
> "How much does SmartWidget cost and what payment methods are accepted?"

**Expected Answer Should Include (from both product specs and FAQ):**
- Starter: $500/month
- Professional: $1,500/month
- Enterprise: $5,000/month
- Credit cards, bank transfers, purchase orders

---

## Verification Checklist

- [ ] Files uploaded successfully
- [ ] Chunking status shows "completed" for all files
- [ ] AI responses reference information from uploaded files
- [ ] Cross-file search works (AI can combine info from multiple files)
- [ ] Response times are reasonable (< 10 seconds)

---

## Troubleshooting

### If RAG is not working:

1. **Check file chunking status**
   - Go to project files view
   - Verify each file shows "completed" status

2. **Check embeddings**
   - API: `GET /api/files/{fileId}/chunks`
   - Each chunk should have an embedding

3. **Check server logs**
   - Look for "[Chunking]" log messages
   - Check for any embedding generation errors

4. **Common issues:**
   - File too large (consider chunking limits)
   - Invalid file format (only text files supported for RAG)
   - OpenAI API rate limits
