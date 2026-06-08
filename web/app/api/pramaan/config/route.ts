import { wrap, json } from '@/lib/http/handler';
import { getScoringConfig } from '@/lib/shared/services/pramaan.service';

// GET /api/pramaan/config - active PRAMAAN scoring configuration (public)
export const GET = wrap(async () => {
    return json(await getScoringConfig());
});
