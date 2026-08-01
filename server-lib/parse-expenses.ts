import { GoogleGenAI, Type } from "@google/genai";
import { getAuthenticatedUser } from "./auth.js";

export async function processParseExpenses(req: any, res: any) {
  try {
    const authHeader = Array.isArray(req.headers?.authorization) 
      ? req.headers.authorization[0] 
      : req.headers?.authorization;
    
    // Require authentication
    await getAuthenticatedUser(authHeader);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const { text, imageBase64, imageMimeType, paidByUid, membersInfo } = req.body || {};

    const memberUids = Object.keys(membersInfo || {});
    const memberDetails = Object.values(membersInfo || {}).map((m: any) => `${m.displayName} (UID: ${m.uid}, Email: ${m.email || ''})`).join('\n');

    const parts: any[] = [];
    if (text) {
      parts.push({ text: `Expense input text:\n${text}` });
    }
    if (imageBase64 && imageMimeType) {
      parts.push({
        inlineData: {
          mimeType: imageBase64.split(',')[1] || imageBase64,
          data: imageBase64.split(',')[1] || imageBase64,
        }
      });
    }

    parts.push({
      text: `You are an AI expense item extractor for a flatmate split app.
Team members available:
${memberDetails}

The person who paid (buyer UID): ${paidByUid}

Rules:
1. Extract the Shop/Store Name if present in text/receipt header (otherwise null).
2. Extract all line items with total price for each item.
3. Determine the list of owner user UIDs who share each item based on names/initials/notes in the input.
   - If "all", "/3", "/N", "everyone", or no owners specified: owners = all member UIDs [${memberUids.join(', ')}].
   - If "me" or "myself": owners = [${paidByUid}].
   - If initials or names are written (e.g. "A", "R", "B", "AR", "A,R", "Ashutosh"): match to corresponding user UIDs.
   - DO NOT CALCULATE BALANCES or settlements. Only identify the items, total prices, and owner UIDs.
4. Categorize each item into one of: 'Vegetables', 'Dairy', 'Snacks', 'Beverages', 'Household', 'Personal Care', 'Rent & Bills', 'General'.
5. If owner mapping is uncertain or ambiguous, set 'isAmbiguous': true.
`
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            shopName: { type: Type.STRING, description: "Name of the shop/store if detected, otherwise null" },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  item: { type: Type.STRING, description: "Item description" },
                  totalAmount: { type: Type.NUMBER, description: "Total price of the item" },
                  owners: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Array of user UIDs who share this item"
                  },
                  category: {
                    type: Type.STRING,
                    description: "Category: Vegetables, Dairy, Snacks, Beverages, Household, Personal Care, Rent & Bills, or General"
                  },
                  isAmbiguous: {
                    type: Type.BOOLEAN,
                    description: "True if owners could not be unambiguously determined"
                  }
                },
                required: ["item", "totalAmount", "owners", "category"]
              }
            }
          },
          required: ["items"]
        }
      }
    });

    const jsonStr = response.text?.trim() || "{}";
    const parsedData = JSON.parse(jsonStr);

    return res.status(200).json(parsedData);
  } catch (error: any) {
    console.error('Error parsing expenses:', error);
    const status = error?.message?.includes('Authentication') ? 401 : 500;
    return res.status(status).json({ error: error.message || 'Failed to parse expenses' });
  }
}
