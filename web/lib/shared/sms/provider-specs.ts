// Declarative config spec per SMS provider — shared by the settings service
// (validation + masking) and the admin page (form rendering). Adding a provider
// = add a spec here + a send branch in sms-sender.ts. No server imports, so this
// is safe to import into the client bundle.

export interface SmsProviderField {
    key: string;
    label: string;
    secret?: boolean;   // masked on read, preserved on blank edit
    required?: boolean;
    placeholder?: string;
}

export interface SmsProviderSpec {
    id: string;
    label: string;
    note?: string;
    fields: SmsProviderField[];
}

export const SMS_PROVIDER_SPECS: SmsProviderSpec[] = [
    {
        id: 'msg91',
        label: 'MSG91',
        note: 'Requires a DLT-approved OTP template containing the OTP variable. The app generates and verifies the code; MSG91 delivers it.',
        fields: [
            { key: 'authKey', label: 'Auth Key', secret: true, required: true },
            { key: 'templateId', label: 'OTP Template ID', required: true },
            { key: 'senderId', label: 'Sender ID', placeholder: 'optional, e.g. PRMAAN' },
        ],
    },
    {
        id: 'grow_infinity',
        label: 'Grow Infinity',
        note: 'Sends the full OTP message body, so the body text must match your DLT-approved template for this Entity/Template ID.',
        fields: [
            { key: 'key', label: 'API Key', secret: true, required: true },
            { key: 'from', label: 'Sender (from)', required: true, placeholder: 'GGURUZ' },
            { key: 'entityid', label: 'DLT Entity ID', required: true },
            { key: 'templateid', label: 'DLT Template ID', required: true },
        ],
    },
];

export const SMS_PROVIDER_IDS = SMS_PROVIDER_SPECS.map((s) => s.id);

export function getSmsProviderSpec(id: string): SmsProviderSpec | undefined {
    return SMS_PROVIDER_SPECS.find((s) => s.id === id);
}
