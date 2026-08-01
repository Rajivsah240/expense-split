import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API routes FIRST
  app.post("/api/parse-expenses", async (req, res) => {
    try {
      const { text, imageBase64, imageMimeType, paidByUid, membersInfo } = req.body;
      
      const memberUids = Object.keys(membersInfo || {});
      const memberDetails = Object.values(membersInfo || {}).map((m: any) => `${m.displayName} (UID: ${m.uid}, Email: ${m.email || ''})`).join('\n');
      
      const parts: any[] = [];
      if (text) {
        parts.push({ text: `Expense input text:\n${text}` });
      }
      if (imageBase64 && imageMimeType) {
        parts.push({
          inlineData: {
            mimeType: imageMimeType,
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
      
      res.json(parsedData);
    } catch (error) {
      console.error('Error parsing expenses:', error);
      res.status(500).json({ error: 'Failed to parse expenses' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
