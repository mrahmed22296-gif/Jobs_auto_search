/**
 * API Endpoint للبحث عن الوظائف
 * المسار: /api/search
 */

export default async function handler(req, res) {
    // التأكد من أن الطلب يتم عبر طريقة GET
    if (req.method !== 'GET') {
        return res.status(405).json({ 
            success: false, 
            message: 'طريقة الطلب غير مدعومة. ياستخدام طريقة GET فقط.' 
        });
    }

    try {
        const { q } = req.query;

        // التحقق من وجود مصطلح البحث
        if (!q || q.trim() === '') {
            return res.status(400).json({ 
                success: false, 
                message: 'يرجى توفير مصطلح البحث (q).' 
            });
        }

        const searchQuery = q.trim();

        // [منطقة جلب البيانات]: يمكنك هنا وضع الكود الخاص بالاتصال بمصادر الوظائف الخارجية أو قاعدة البيانات
        // كمثال توضيحي، سنقوم بفلترة أو توليد نتائج بناءً على الاستعلام المدخل:
        
        const fetchedJobs = [
            {
                id: 1,
                title: `مطور ${searchQuery}`,
                company: 'شركة البرمجيات الذكية',
                location: 'عن بعد',
                link: 'https://example.com/job/1'
            },
            {
                id: 2,
                title: `أخصائي ${searchQuery}`,
                company: 'مؤسسة التقنية المتقدمة',
                location: 'الرياض، السعودية',
                link: 'https://example.com/job/2'
            }
        ];

        // إرجاع النتائج بنجاح
        return res.status(200).json({
            success: true,
            query: searchQuery,
            count: fetchedJobs.length,
            jobs: fetchedJobs
        });

    } catch (error) {
        // إدارة الأخطاء الخوادم الداخلية
        console.error('Error in search API:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'حدث خطأ داخلي في الخادم أثناء معالجة طلب البحث.' 
        });
    }
}
