// Code-default transactional email templates + a tiny render engine.
//
// Each template is plain HTML/text with placeholders:
//   {{var}}                  -> data.var (empty string if missing)
//   {{#if var}}...{{/if}}    -> block shown when data.var is truthy
//   {{#unless var}}...{{/unless}} -> block shown when data.var is falsy
// Blocks do not nest. This is intentionally minimal so admins can safely edit
// templates in the dashboard without a templating runtime.
//
// A row in `email_templates` overrides the default for a key; deleting that row
// reverts to the default here. New transactional emails get a new entry here.

export interface TemplateVar {
    name: string;
    description: string;
    /** Example value used for preview / test sends. */
    sample: string;
}

export interface TemplateDef {
    key: string;
    name: string;
    description: string;
    /** Per-send variables (branding variables below are always available too). */
    variables: TemplateVar[];
    subject: string;
    html: string;
    text: string;
}

/** Branding variables injected into every template from system settings. */
export const BRANDING_VARS: TemplateVar[] = [
    { name: 'siteName', description: 'Product/brand name from System Settings', sample: 'Pramaan' },
    { name: 'supportEmail', description: 'Support email from System Settings', sample: 'support@pramaan.gadgetguruz.com' },
    { name: 'companyName', description: 'Legal company name from System Settings', sample: 'GadgetGuruz' },
];

const purchaseConfirmation: TemplateDef = {
    key: 'purchase_confirmation',
    name: 'Purchase Confirmation',
    description: 'Sent to a customer after a successful license purchase, with the license key and (for new accounts) login credentials.',
    variables: [
        { name: 'name', description: "Customer's name (may be empty)", sample: 'Asha' },
        { name: 'email', description: "Customer's email", sample: 'asha@example.com' },
        { name: 'licenseKey', description: 'The purchased license key', sample: 'PRMN-XXXX-XXXX-XXXX' },
        { name: 'planName', description: 'Name of the purchased plan', sample: 'Pro Annual' },
        { name: 'password', description: 'Temp password — present only for a newly created account', sample: 'Temp#1234' },
        { name: 'loginUrl', description: 'URL to the customer account portal', sample: 'https://app.pramaan.com/customer/account' },
    ],
    subject: 'Your {{planName}} license & account details',
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
  <h2 style="color:#7c3aed">Thank you for your purchase</h2>
  <p>{{#if name}}Hi {{name}},{{/if}}{{#unless name}}Hi,{{/unless}}</p>
  <p>Your purchase of <b>{{planName}}</b> is confirmed. Here is your license key:</p>
  <div style="font-family:monospace;font-size:20px;letter-spacing:2px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:8px;padding:14px;text-align:center;margin:12px 0">
    {{licenseKey}}
  </div>
  {{#if password}}<p>An account has been created for you so you can manage your licenses:</p>
  <table cellpadding="6" style="border-collapse:collapse;margin:8px 0">
    <tr><td style="color:#64748b">Email</td><td><b>{{email}}</b></td></tr>
    <tr><td style="color:#64748b">Password</td><td><b>{{password}}</b></td></tr>
  </table>
  <p style="color:#64748b;font-size:13px">For your security, please log in and change this password.</p>{{/if}}{{#unless password}}<p>Use your existing account at <a href="{{loginUrl}}">{{loginUrl}}</a> to manage your licenses.</p>{{/unless}}
  <p style="margin-top:16px"><a href="{{loginUrl}}" style="background:#7c3aed;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">Go to your account</a></p>
  <p style="color:#94a3b8;font-size:12px;margin-top:24px">If you didn't make this purchase, please contact support{{#if supportEmail}} at {{supportEmail}}{{/if}}.</p>
</div>`,
    text: `{{#if name}}Hi {{name}},{{/if}}{{#unless name}}Hi,{{/unless}}

Your purchase of {{planName}} is confirmed.

License key: {{licenseKey}}
{{#if password}}
Your login credentials:
  Email: {{email}}
  Password: {{password}}
(Please log in and change this password.)
{{/if}}{{#unless password}}
Manage your licenses at {{loginUrl}}
{{/unless}}
Account: {{loginUrl}}
`,
};

export const TEMPLATE_REGISTRY: Record<string, TemplateDef> = {
    [purchaseConfirmation.key]: purchaseConfirmation,
};

export function getTemplateDef(key: string): TemplateDef | null {
    return TEMPLATE_REGISTRY[key] ?? null;
}

export function listTemplateDefs(): TemplateDef[] {
    return Object.values(TEMPLATE_REGISTRY);
}

/** Render a template string against a data map. See file header for syntax. */
export function renderString(template: string, data: Record<string, unknown>): string {
    const truthy = (k: string) => {
        const v = data[k];
        return v !== undefined && v !== null && v !== '' && v !== false;
    };
    let out = template.replace(/\{\{#if\s+([\w]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, k, body) =>
        truthy(k) ? body : ''
    );
    out = out.replace(/\{\{#unless\s+([\w]+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (_m, k, body) =>
        truthy(k) ? '' : body
    );
    out = out.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_m, k) => {
        const v = data[k];
        return v === undefined || v === null ? '' : String(v);
    });
    return out;
}
