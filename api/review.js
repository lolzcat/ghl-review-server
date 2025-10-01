// api/review.js - Vercel Serverless Function
// This file goes in the /api directory for Vercel deployment

export default async function handler(req, res) {
  // Enable CORS for your WordPress site
  const allowedOrigins = [
    'https://app.gohighlevel.com',  // Your WordPress domain
    'http://localhost',              // For local testing
    // Add your actual WordPress domain here:
    'https://www.huffmanhuffman.com'
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get environment variables (set in Vercel dashboard)
  const ACCESS_TOKEN = process.env.GHL_ACCESS_TOKEN;
  const LOCATION_ID = process.env.GHL_LOCATION_ID;
  
  if (!ACCESS_TOKEN || !LOCATION_ID) {
    console.error('Missing environment variables');
    return res.status(500).json({ 
      error: 'Server configuration error',
      detail: 'Missing API credentials'
    });
  }

  // Your custom field IDs from GHL
  const CUSTOM_FIELDS = {
    RATING: "E6wd31Ij8ld7ctPsgsnZ",
    REVIEW_LOCATION: "paKbVGQE6MaTvGabVnj0",
    REVIEW_DATE: "SLwouXYkId5VYl11b3R9",
    YOUR_FEEDBACK: "8fvluSPLrqs9EVYEyPME"
  };

  // LeadConnector API configuration
  const BASE_URL = "https://services.leadconnectorhq.com";
  const headers = {
    "Authorization": `Bearer ${ACCESS_TOKEN}`,
    "Version": "2021-07-28",
    "Content-Type": "application/json"
  };

  try {
    // Extract data from request body
    const { 
      name, 
      email, 
      phone, 
      feedback, 
      rating, 
      location, 
      date, 
      source 
    } = req.body;

    console.log('Received submission:', { name, email, rating, location });

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        detail: 'Name and email are required'
      });
    }

    // 1. Upsert contact with custom fields
    const upsertBody = {
  locationId: LOCATION_ID,
  name: name,
  email: email,
  phone: phone || "",
  source: source || "Website Review Widget",
  // Custom fields directly here, not nested
  [CUSTOM_FIELDS.RATING]: String(rating || ""),
  [CUSTOM_FIELDS.REVIEW_LOCATION]: String(location || ""),
  [CUSTOM_FIELDS.REVIEW_DATE]: date || new Date().toISOString(),
  [CUSTOM_FIELDS.YOUR_FEEDBACK]: String(feedback || "")
};

    console.log('Upserting contact...');
    
    const upsertResponse = await fetch(`${BASE_URL}/contacts/upsert`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(upsertBody)
    });

    if (!upsertResponse.ok) {
      const errorText = await upsertResponse.text();
      console.error('Upsert failed:', errorText);
      return res.status(upsertResponse.status).json({ 
        step: "upsert", 
        error: errorText 
      });
    }

    const upsertData = await upsertResponse.json();
    const contactId = upsertData.contact?.id || upsertData.id;
    
    if (!contactId) {
      console.error('No contact ID returned');
      return res.status(500).json({ 
        error: 'Failed to create/update contact',
        detail: 'No contact ID returned'
      });
    }

    console.log('Contact upserted successfully:', contactId);

    // 2. Create a note for the contact
    const noteText = [
      `=== Review Submission ===`,
      `Star Rating: ${rating || 'Not provided'}`,
      `Location: ${location || 'Not specified'}`,
      `Date: ${date || new Date().toISOString()}`,
      ``,
      `Feedback:`,
      feedback || "(No feedback provided)",
      ``,
      `Source: ${source || 'Website Review Widget'}`
    ].join("\n");

    console.log('Adding note to contact...');
    
    const noteResponse = await fetch(`${BASE_URL}/contacts/${contactId}/notes`, {
      method: "POST",
      headers: headers,
      body: JSON.stringify({ body: noteText })
    });

    if (!noteResponse.ok) {
      const errorText = await noteResponse.text();
      console.error('Note creation failed:', errorText);
      // Don't fail the whole request if note fails
    }

    // 3. Add tags for low ratings (1-3 stars)
    if (rating && Number(rating) <= 3) {
      const tag = `${rating}-star-rating`;
      console.log('Adding low rating tag:', tag);
      
      const tagResponse = await fetch(`${BASE_URL}/contacts/${contactId}/tags`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ tags: [tag] })
      });

      if (!tagResponse.ok) {
        const errorText = await tagResponse.text();
        console.error('Tag creation failed:', errorText);
        // Don't fail the whole request if tag fails
      }
    }

    // Success response
    console.log('Review submitted successfully');
    return res.status(200).json({ 
      success: true, 
      contactId: contactId,
      message: 'Review submitted successfully'
    });

  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Server error', 
      detail: error.message || String(error)
    });
  }
}
