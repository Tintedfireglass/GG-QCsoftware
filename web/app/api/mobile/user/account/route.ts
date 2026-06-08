import { mobileWrap, mobileOk, parseMobileBody } from '@/lib/platforms/android/http';
import { requireCustomer } from '@/lib/http/customer-auth';
import { deleteAccountSchema } from '@/lib/platforms/android/domain/schemas/mobile';
import { deleteAccount } from '@/lib/platforms/android/services/mobile-auth.service';

// DELETE /api/mobile/user/account — permanently deactivate the account (confirmDelete:true)
export const DELETE = mobileWrap(async (request) => {
    const { customerId } = requireCustomer(request);
    await parseMobileBody(request, deleteAccountSchema);
    const r = await deleteAccount(customerId);
    return mobileOk({ message: r.message });
});
