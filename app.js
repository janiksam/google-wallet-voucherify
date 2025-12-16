/*
 * Copyright 2022 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');

// Load credentials: either a path to a JSON file, or a JSON string in the env var
let credentials;
const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!gac) {
  throw new Error('GOOGLE_APPLICATION_CREDENTIALS is not set');
}

try {
  if (gac.trim().startsWith('{')) {
    // env var contains the JSON text
    credentials = JSON.parse(gac);
  } else {
    // env var contains a path to the JSON file
    const resolved = path.resolve(gac);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Credentials file not found at ${resolved}`);
    }
    credentials = require(resolved);
    //console.log(credentials)
  }
} catch (err) {
  console.error('Failed to load GOOGLE_APPLICATION_CREDENTIALS:', err.message);
  throw err;
}

const express = require('express');
const bodyParser = require('body-parser');
const { GoogleAuth } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');

async function fetchVoucherifyData(customerId) {
  const base = process.env.VOUCHERIFY_BASE_URL || 'https://api.voucherify.io';
  const campaignId = process.env.LOYALTY_PROGRAM_ID;
  const headers = {
    'X-App-Id': process.env.VOUCHERIFY_APPLICATION_ID,
    'X-App-Token': process.env.VOUCHERIFY_SECRET_KEY,
    'Content-Type': 'application/json',
    'X-Voucherify-Channel': 'GoogleWalletPOC'
  };

  const customerPath = `/v1/customers/${encodeURIComponent(customerId)}`;
  const membersPath = campaignId
    ? `/v1/loyalties/${encodeURIComponent(campaignId)}/members?customer=${encodeURIComponent(customerId)}`
    : null;

  try {
    // Fetch customer and (optionally) members concurrently
    const requests = [axios.get(`${base}${customerPath}`, { headers })];
    if (membersPath) requests.push(axios.get(`${base}${membersPath}`, { headers }));

    const [customerResp, membersResp] = await Promise.all(requests);
    const d = customerResp?.data || {};
    const m = membersResp?.data || {};

    // Customer name extraction (adjust to your exact response shape if needed)
    const name =
      d.name ??
      customerId ??
      '';

    // Points extraction (adjust keys to match your Voucherify response)
    const points =
      (process.env.LOYALTY_PROGRAM_NAME && d.loyalty?.campaigns?.[process.env.LOYALTY_PROGRAM_NAME]?.points) ??
      0;

    // Loyalty code comes from the members endpoint: resp.data.vouchers[0].code
    const loyaltyCode =
      (Array.isArray(m.vouchers) && m.vouchers[0] && m.vouchers[0].code) ? String(m.vouchers[0].code) : '';

    return { name: String(name), points: String(points), loyaltyCode };
  } catch (err) {
    console.error(`Voucherify request failed for customer ${customerId}:`, err && err.message);
    return { name: customerId, points: '0', loyaltyCode: '' };
  }
};

const issuerId = process.env.ISSUER_ID;
//console.log(issuerId)
const loyaltyClassId = process.env.GOOGLE_WALLET_LOYALTY_CARD_CLASS_ID;
//console.log('Using loyalty class ID:', loyaltyClassId);

const classId = `${issuerId}.${loyaltyClassId}`;
//console.log('Using class ID:', classId);

const baseUrl = process.env.GOOGLE_WALLET_API_URL || 'https://walletobjects.googleapis.com/walletobjects/v1';

//const credentials = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);

const scopes = process.env.GOOGLE_WALLET_API_SCOPES || 'https://www.googleapis.com/auth/wallet_object.issuer';

const httpClient = new GoogleAuth({
  credentials: credentials,
  scopes: scopes
});

/**
 * Creates a sample pass class based on the template defined below.
 * 
 * This class contains multiple editable fields that showcase how to 
 * customize your class.
 * 
 * @param res A representation of the HTTP result in Express.
 */
async function createPassClass(res) {
  // TODO: Create a Generic pass class
  let genericClass = {
    'id': `${classId}`,
    "enableSmartTap": true,
    'classTemplateInfo': {
      'cardTemplateOverride': {
        'cardRowTemplateInfos': [
          {
            'oneItem': {
              'item': {
                'firstValue': {
                  'fields': [
                    {
                      'fieldPath': "object.textModulesData['points']"
                    }
                  ]
                }
              }
            }
          }
        ]
      },
      'detailsTemplateOverride': {
        'detailsItemInfos': [
          {
            'item': {
              'firstValue': {
                'fields': [
                  {
                    'fieldPath': "class.imageModulesData['event_banner']"
                  }
                ]
              }
            }
          },
          {
            'item': {
              'firstValue': {
                'fields': [
                  {
                    'fieldPath': "class.textModulesData['game_overview']"
                  }
                ]
              }
            }
          },
          {
            'item': {
              'firstValue': {
                'fields': [
                  {
                    'fieldPath': "class.linksModuleData.uris['official_site']"
                  }
                ]
              }
            }
          },
          {
            'item': {
              'firstValue': {
                'fields': [
                  {
                    'fieldPath': "class.linksModuleData.uris['official_phone']"
                  }
                ]
              }
            }
          },
          {
            'item': {
              'firstValue': {
                'fields': [
                  {
                    'fieldPath': "class.linksModuleData.uris['official_location']"
                  }
                ]
              }
            }
          },
          {
            'item': {
              'firstValue': {
                'fields': [
                  {
                    'fieldPath': "class.linksModuleData.uris['official_email']"
                  }
                ]
              }
            }
          }
        ]
      }
    },
    'imageModulesData': [
      {
        'mainImage': {
          'sourceUri': {
            'uri': process.env.GOOGLE_WALLET_MAIN_IMAGE_URI
          },
          'contentDescription': {
            'defaultValue': {
              'language': 'en-US',
              'value': 'Loyalty Card Example'
            }
          }
        },
        'id': 'event_banner'
      }
    ],
    'textModulesData': [
      {
        'header': 'Gather points by making purshases at any of our channels.',
        'body': 'Join the program and accumulate points by making purchases. Redeem your points for exclusive rewards and offers in the app or website.',
        'id': 'game_overview'
      }
    ],
    'linksModuleData': {
      'uris': [
        {
          'uri': process.env.GOOGLE_WALLET_OFFICIAL_SITE || 'https://voucherify.io/',
          'description': 'Official Site',
          'id': 'official_site'
        },
        {
          'uri': process.env.GOOGLE_WALLET_PHONE_NUMBER || 'tel:+1234567890',
          'description': 'Contact Number',
          'id': 'official_phone'
        },
        {
          'uri': process.env.GOOGLE_WALLET_LOCATION || 'https://maps.app.goo.gl/f4A45rhuSNMXrVsb9',
          'description': 'Location',
          'id': 'official_location'
        },
        {
          'uri': process.env.GOOGLE_WALLET_EMAIL || 'mailto:support@voucherify.io',
          'description': 'Email',
          'id': 'official_email'
        }
      ]
    }
  };
  let response;
  try {
    // Check if the class exists already
    response = await httpClient.request({
      url: `${baseUrl}/genericClass/${classId}`,
      method: 'GET'
    });

    console.log('Class already exists');
    console.log(response);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      // Class does not exist
      // Create it now
      response = await httpClient.request({
        url: `${baseUrl}/genericClass`,
        method: 'POST',
        data: genericClass
      });

      console.log('Class insert response');
      console.log(response);
    } else {
      // Something else went wrong
      console.log(err);
      res.send('Something went wrong...check the console logs!');
    }
  }
}

/**
 * Creates a sample pass object based on a given class.
 * 
 * @param req A representation of the HTTP request in Express.
 * @param res A representation of the HTTP result in Express.
 * @param classId The identifier of the parent class used to create the object.
 */
async function createPassObject(req, res, classId) {
  // TODO: Create a new Generic pass for the user
  let objectSuffix = `${req.body.email.replace(/[^\w.-]/g, '_')}`;
  let objectPostFix = process.env.GOOGLE_WALLET_LOYALTY_CARD_OBJECT_POSTFIX;
  let objectId = `${issuerId}.${objectSuffix}.${objectPostFix}`;

  // Fetch voucherify data for this customer
  const voucherData = await fetchVoucherifyData(req.body.email);

  let genericObject = {
    'id': `${objectId}`,
    'classId': classId,
    'genericType': 'GENERIC_TYPE_UNSPECIFIED',
    'hexBackgroundColor': process.env.GOOGLE_WALLET_HEX_BACKGROUND_COLOR || '#fcba03',
    'logo': {
      'sourceUri': {
        'uri': process.env.GOOGLE_WALLET_LOGO_IMAGE_URI
      }
    },
    'cardTitle': {
      'defaultValue': {
        'language': 'en',
        'value': process.env.GOOGLE_WALLET_CARD_TITLE || 'Loyalty Card'
      }
    },
    'subheader': {
      'defaultValue': {
        'language': 'en',
        'value': 'Card Holder'
      }
    },
    'header': {
      'defaultValue': {
        'language': 'en',
        'value': voucherData.name // injected customer name
      }
    },
    'barcode': {
      'type': 'QR_CODE',
      'value': voucherData.loyaltyCode, // injected loyalty code
    },
    'heroImage': {
      'sourceUri': {
        'uri': process.env.GOOGLE_WALLET_HERO_IMAGE_URI
      }
    },
    'textModulesData': [
      {
        'header': 'POINTS',
        'body': voucherData.points, // injected points
        'id': 'points'
      }
    ]
  };

  // TODO: Create the signed JWT and link
  const claims = {
    iss: credentials.client_email,
    aud: 'google',
    origins: [],
    typ: 'savetowallet',
    payload: {
      genericObjects: [
        genericObject
      ]
    }
  };

  const token = jwt.sign(claims, credentials.private_key, { algorithm: 'RS256' });
  const saveUrl = `https://pay.google.com/gp/v/save/${token}`;

  res.send(`<a href='${saveUrl}'><img src='wallet-button.png'></a>`);

}

const app = express();

//app.use(bodyParser.urlencoded({ extended: true }));
//app.use(express.static('public'));

// capture raw JSON for webhook signature verification
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use(express.static('public'));

// Verify Voucherify webhook signature (HMAC SHA256). Set VOUCHERIFY_WEBHOOK_SECRET in .env.
function verifyVoucherifySignature(req) {
  const secret = process.env.VOUCHERIFY_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('VOUCHERIFY_WEBHOOK_SECRET not set — skipping signature verification');
    return true;
  }
  const sigHeader = (req.headers['x-voucherify-signature'] || req.headers['x-voucherify-signature-sha256'] || '').toString();
  if (!sigHeader) return false;
  const hmac = crypto.createHmac('sha256', secret).update(req.rawBody || '').digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(sigHeader));
  } catch (e) {
    return false;
  }
}

// Reuse the same object id construction you use when creating objects
function makeObjectIdFromEmail(email) {
  const objectSuffix = String(email || '').replace(/[^\w.-]/g, '_');
  const objectPostFix = process.env.GOOGLE_WALLET_LOYALTY_CARD_OBJECT_POSTFIX;
  return `${issuerId}.${objectSuffix}.${objectPostFix}`;
}

// Patch the Google Wallet GenericObject textModulesData.points field
async function patchGoogleWalletPoints(objectId, newPoints) {
  const url = `${baseUrl}/genericObject/${encodeURIComponent(objectId)}?updateMask=textModulesData`;
  const payload = {
    id: objectId,
    textModulesData: [
      { id: 'points', header: 'POINTS', body: String(newPoints) }
    ]
  };
  return httpClient.request({ url, method: 'PATCH', data: payload });
}

// Voucherify webhook endpoint
app.post('/voucherify-webhook', async (req, res) => {
  // quick ack
  if (!verifyVoucherifySignature(req)) {
    res.status(401).send('invalid signature');
    return;
  }
  res.status(200).send('ok');

  // process async so we ack fast
  (async () => {
    try {
      const payload = req.body || {};

      // Adjust these extractions to match the exact Voucherify payload you receive.
      const customerEmail =
        payload.data?.holder?.email ??
        payload.data?.holder?.source_id ??
        '';

      const newPoints =
        payload.data?.transaction?.details?.balance?.balance ??
        payload.data?.voucher?.loyalty_card?.balance ??
        null;

      if (!customerEmail || newPoints == null) {
        console.warn('Webhook missing required fields', { customerEmail, newPoints, payload });
        return;
      }

      const objectId = makeObjectIdFromEmail(customerEmail);
      await patchGoogleWalletPoints(objectId, newPoints);
      console.log(`Patched ${objectId} with points=${newPoints}`);
    } catch (err) {
      console.error('Error processing Voucherify webhook:', err && err.message);
    }
  })();
});

app.post('/', async (req, res) => {
  await createPassClass(res);
  await createPassObject(req, res, classId);
});
app.listen(3000);