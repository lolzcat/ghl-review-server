// api/review.js - Vercel Serverless Function
// Fixed version that creates contact first, then updates custom fields

export default async function handler(req, res) {
  // Enable CORS for your WordPress site
  const allowedOrigins = [
    'https://app.gohighlevel.com',
    'http://localhost',
    // Add your actual WordPress domain here:
    // 'https://yourdomain.com'
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

  // Get environment variables
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

    // Step 1: Create/Update contact WITHOUT custom fields
    const upsertBody = {
      locationId: LOCATION_ID,
      name: name,
      email: email,
      phone: phone || "",
      source: source || "Website Review Widget"
    };

    console.log('Step 1: Creating/updating contact...');
    
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

    console.log('Contact created/updated successfully:', contactId);

    // Step 2: Update custom fields using the contact update endpoint
    const customFieldsBody = {
      customFields: [
        { 
          id: CUSTOM_FIELDS.RATING, 
          value: String(rating || "") 
        },
        { 
          id: CUSTOM_FIELDS.REVIEW_LOCATION, 
          value: String(location || "") 
        },
        { 
          id: CUSTOM_FIELDS.REVIEW_DATE, 
          value: date || new Date().toISOString() 
        },
        { 
          id: CUSTOM_FIELDS.YOUR_FEEDBACK, 
          value: String(feedback || "") 
        }
      ]
    };

    console.log('Step 2: Updating custom fields...');
    
    const updateResponse = await fetch(`${BASE_URL}/contacts/${contactId}`, {
      method: "PUT",
      headers: headers,
      body: JSON.stringify(customFieldsBody)
    });

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      console.error('Custom fields update failed:', errorText);
      // Don't fail completely if custom fields fail - contact is still created
      console.log('Note: Contact created but custom fields update failed');
    } else {
      console.log('Custom fields updated successfully');
    }

    // Step 3: Create a note for the contact
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

    console.log('Step 3: Adding note to contact...');
    
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

    // Step 4: Add tags for low ratings (1-3 stars)
    if (rating && Number(rating) <= 3) {
      const tag = `${rating}-star-rating`;
      console.log('Step 4: Adding low rating tag:', tag);
      
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
