/* =========================================================
   Unforgettable You — bilingual engine (English / עברית)
   Faithful Hebrew translation with full RTL support.
   ========================================================= */
(function () {
  "use strict";

  var YEAR = new Date().getFullYear();

  var T = {
    en: {
      "nav.story": "Our Story",
      "nav.journey": "The Journey",
      "nav.memoir": "Zvika's Memoir",
      "nav.gallery": "Gallery",
      "nav.legacy": "Legacy",
      "nav.cta": "Preserve a Story",
      "nav.contact": "Contact",

      "hero.eyebrow": "A Love Story · Written Across Continents",
      "hero.name1": "Racheli",
      "hero.name2": "Zvika",
      "hero.lede": "Two lives shaped by history, separated by oceans, and joined by a single phone call in the winter of 2012. This is their story — and it deserves to be unforgettable.",
      "hero.cta1": "Read Their Story",
      "hero.cta2": "Explore the Journey",
      "hero.scroll": "Scroll",

      "story.kicker": "Chapter One",
      "story.title": "How We Met",
      "story.sub": "Tel Aviv · February 2012",
      "story.stamp": "Est. 2012",
      "story.p1": "We met through an Israeli website called <em>Nifgashim</em>. Our first phone call was on Monday, February 27, 2012. At the end of that call, Racheli invited Zvika to meet two days later in her apartment in Tel Aviv.",
      "story.p2": "On Friday evening we drove to a quiet Italian restaurant called Francesca, near the beach in Rishon-LeZion, where we could talk and truly get to know one another. Zvika spoke of his early life, and Racheli was moved by his story. That evening, we formed the first emotional bond — and decided to keep meeting.",
      "story.p3": "We took our first trip into nature soon after, to the Besor River near Be'er Sheva. We found a quiet green patch, sat with a picnic basket, and felt the pull of something far greater than ourselves. From there, our relationship deepened week after week, full of adventure.",
      "story.quote": "“We both knew we wanted to share our lives between Israel and California — a love with two homes and no borders.”",
      "story.p4": "In mid-May we moved in together in Tel Aviv. In June we flew to London to stay with our friend Dorothy, then on to Los Angeles, where we spent a summer we still call <strong>our honeymoon</strong>.",

      "tl.kicker": "Chapter Two",
      "tl.title": "The Journey",
      "tl.sub": "Milestones of a shared life",
      "tl.d1": "Feb 27, 2012", "tl.t1": "The First Call", "tl.b1": "A single phone call through Nifgashim that would change everything.",
      "tl.d2": "Feb 29, 2012", "tl.t2": "First Meeting", "tl.b2": "Two days later, a first meeting in Racheli's Tel Aviv apartment.",
      "tl.d3": "Mar 3, 2012", "tl.t3": "Dinner at Francesca", "tl.b3": "A quiet Italian restaurant by the beach — and the first true spark.",
      "tl.d4": "Spring 2012", "tl.t4": "The Besor River", "tl.b4": "A picnic in nature where the relationship began to truly bloom.",
      "tl.d5": "May 2012", "tl.t5": "A Shared Home", "tl.b5": "Moving in together in Tel Aviv before a summer abroad.",
      "tl.d6": "Jun 25, 2012", "tl.t6": "London Days", "tl.b6": "A few golden days with their friend Dorothy — shows, friends, family.",
      "tl.d7": "Jun 29, 2012", "tl.t7": "A Summer in Los Angeles", "tl.b7": "The honeymoon — a love now living happily across two continents.",

      "mem.kicker": "Chapter Three",
      "mem.title": "Zvika's Memoir",
      "mem.sub": "From Bucharest to a life of courage",
      "mem.intro": "Before the love story, there was a life of remarkable resilience — a child of the Holocaust who became a soldier, a leader, and a survivor in every sense of the word. These are his words, preserved.",
      "mem.t1": "Born in Bucharest",
      "mem.b1": "I was born on April 29, 1944, in Bucharest, Romania. On March 15, 1949, we immigrated to Israel, spending our first four months in a transit camp called a <em>Ma'abara</em> before becoming citizens and moving to a village called Kfar-Yona, where I began elementary school.",
      "mem.t2": "A Hard Neighborhood",
      "mem.b2": "In August 1954 we moved to Tel Aviv, to a neighborhood called Shabazi — poor, crowded, and often violent. Families had arrived from many lands, each carrying their own customs. It was a world that demanded toughness from a boy, long before he was ready for it.",
      "mem.t3": "Reading the Torah",
      "mem.b3": "In April 1957, thanks to a kind Rabbi who prepared me, I read from the Torah at my Bar Mitzvah. My uncle Moritz — who would one day save my life — gave me a gold Star of David pendant. For the first time, my grandfather approached me with quiet pride.",
      "mem.t4": "A Survivor's Instinct",
      "mem.b4": "As a Holocaust survivor who had witnessed terrible cruelty, the streets taught me to defend myself. I was sharper than the other boys, and I used that mind to stay one step ahead — until my parents, fearing for my future, sent me to live with my uncle Moritz in Jaffa.",
      "mem.t5": "A Soldier & A Commander",
      "mem.b5": "In May 1962 I joined the army as a fighter. I served in combat, completed the combat officer course, and went on to command a company. The boy from Shabazi had become a leader — and the story was only beginning.",
      "mem.t6": "The Story Continues…",
      "mem.b6": "A full life of family, grandchildren, and love still waits to be written here — chapter by chapter, in his own voice.",
      "mem.cta": "Help preserve the next chapter →",

      "gal.kicker": "Chapter Four",
      "gal.title": "A Life in Photographs",
      "gal.sub": "Moments, places, and the people who matter",

      "leg.quote": "Some stories are too important to be forgotten. They are meant to be kept, passed down, and treasured — for the children, the grandchildren, and everyone who comes after.",
      "leg.attr": "— The heart of Unforgettable You",

      "cta.kicker": "For Families & Storytellers",
      "cta.title": "Preserve a Story That Lasts Forever",
      "cta.lede": "Every family has an unforgettable story. We turn memories, letters, and photographs into a beautiful, living digital keepsake — designed with care, built to last, and ready to share with generations to come.",
      "cta.f1": "Elegant, fully custom design",
      "cta.f2": "Interactive timelines & chapters",
      "cta.f3": "Photo & video galleries",
      "cta.f4": "Private or public sharing",
      "cta.formTitle": "Start the Conversation",
      "cta.name": "Your name",
      "cta.email": "Email address",
      "cta.msg": "Tell us about the story you'd like to preserve",
      "cta.send": "Send Inquiry",
      "cta.sent": "Sent",
      "cta.note": "Thank you — we'll be in touch shortly. ♥",

      "ph.addPhoto": "Add your photo",
      "ph.here": "Your photo here",
      "cap.firstPhoto": "Their first photograph together",
      "cap.telaviv": "Tel Aviv, 2012",
      "cap.besor": "The Besor River",
      "cap.london": "London, June 2012",
      "cap.la": "Summer in Los Angeles",
      "cap.family": "Family",

      "footer.copy": "© " + YEAR + " Unforgettable You · The story of Racheli & Zvika",
      "footer.credit": "A keepsake crafted with care."
    },

    he: {
      "nav.story": "הסיפור שלנו",
      "nav.journey": "המסע",
      "nav.memoir": "סיפורו של צביקה",
      "nav.gallery": "גלריה",
      "nav.legacy": "מורשת",
      "nav.cta": "הנציחו סיפור",
      "nav.contact": "צרו קשר",

      "hero.eyebrow": "סיפור אהבה · שנכתב בין יבשות",
      "hero.name1": "רחלי",
      "hero.name2": "צביקה",
      "hero.lede": "שני חיים שעוצבו בידי ההיסטוריה, הופרדו על ידי אוקיינוסים, ואוחדו בשיחת טלפון אחת בחורף 2012. זהו סיפורם — והוא ראוי להיות בלתי נשכח.",
      "hero.cta1": "קראו את סיפורם",
      "hero.cta2": "גלו את המסע",
      "hero.scroll": "גללו",

      "story.kicker": "פרק ראשון",
      "story.title": "איך נפגשנו",
      "story.sub": "תל אביב · פברואר 2012",
      "story.stamp": "משנת 2012",
      "story.p1": "נפגשנו דרך אתר ישראלי בשם <em>נפגשים</em>. שיחת הטלפון הראשונה שלנו הייתה ביום שני, 27 בפברואר 2012. בסיומה של אותה שיחה הזמינה רחלי את צביקה להיפגש יומיים לאחר מכן בדירתה בתל אביב.",
      "story.p2": "בערב יום שישי נסענו למסעדה איטלקית שקטה בשם פרנצ'סקה, סמוך לחוף הים בראשון לציון, שם יכולנו לשוחח ולהכיר זה את זה באמת. צביקה סיפר על שנותיו הראשונות, ורחלי נגעה ללבה סיפורו. באותו ערב נוצר הקשר הרגשי הראשון — והחלטנו להמשיך להיפגש.",
      "story.p3": "זמן קצר לאחר מכן יצאנו לטיול הראשון שלנו בטבע, אל נחל הבשור הסמוך לבאר שבע. מצאנו פינה ירוקה ושקטה, ישבנו עם סל פיקניק, וחשנו משיכה אל משהו גדול בהרבה מאיתנו. משם העמיקה מערכת היחסים שלנו שבוע אחר שבוע, מלאת הרפתקאות.",
      "story.quote": "”שנינו ידענו שאנו רוצים לחלוק את חיינו בין ישראל לקליפורניה — אהבה עם שני בתים וללא גבולות.“",
      "story.p4": "באמצע מאי עברנו לגור יחד בתל אביב. ביוני טסנו ללונדון לשהות אצל חברתנו דורותי, ומשם להוס אנג'לס, שם בילינו קיץ שאנו עדיין מכנים <strong>ירח הדבש שלנו</strong>.",

      "tl.kicker": "פרק שני",
      "tl.title": "המסע",
      "tl.sub": "אבני דרך של חיים משותפים",
      "tl.d1": "27 בפברואר 2012", "tl.t1": "השיחה הראשונה", "tl.b1": "שיחת טלפון אחת דרך 'נפגשים' שעתידה הייתה לשנות הכול.",
      "tl.d2": "29 בפברואר 2012", "tl.t2": "המפגש הראשון", "tl.b2": "יומיים לאחר מכן, מפגש ראשון בדירתה של רחלי בתל אביב.",
      "tl.d3": "3 במרץ 2012", "tl.t3": "ארוחה בפרנצ'סקה", "tl.b3": "מסעדה איטלקית שקטה לחוף הים — והניצוץ האמיתי הראשון.",
      "tl.d4": "אביב 2012", "tl.t4": "נחל הבשור", "tl.b4": "פיקניק בטבע שבו החלה מערכת היחסים לפרוח באמת.",
      "tl.d5": "מאי 2012", "tl.t5": "בית משותף", "tl.b5": "עוברים לגור יחד בתל אביב לפני קיץ בחו\"ל.",
      "tl.d6": "25 ביוני 2012", "tl.t6": "ימים בלונדון", "tl.b6": "כמה ימים זהובים עם חברתם דורותי — הצגות, חברים ומשפחה.",
      "tl.d7": "29 ביוני 2012", "tl.t7": "קיץ בלוס אנג'לס", "tl.b7": "ירח הדבש — אהבה שחיה כעת באושר בין שתי יבשות.",

      "mem.kicker": "פרק שלישי",
      "mem.title": "סיפורו של צביקה",
      "mem.sub": "מבוקרשט אל חיים של אומץ",
      "mem.intro": "לפני סיפור האהבה היו חיים של חוסן יוצא דופן — ילד ניצול שואה שהפך ללוחם, למפקד, ולשורד במלוא מובן המילה. אלו דבריו, שמורים לדורות.",
      "mem.t1": "נולד בבוקרשט",
      "mem.b1": "נולדתי ב-29 באפריל 1944 בבוקרשט שברומניה. ב-15 במרץ 1949 עלינו לישראל, ובילינו את ארבעת החודשים הראשונים ב<em>מעברה</em> בטרם הפכנו לאזרחים ועברנו לכפר יונה, שם החלתי את לימודיי בבית הספר היסודי.",
      "mem.t2": "שכונה קשה",
      "mem.b2": "באוגוסט 1954 עברנו לתל אביב, לשכונה בשם שבזי — ענייה, צפופה ולא פעם אלימה. משפחות הגיעו מארצות רבות, כל אחת על מנהגיה. זה היה עולם שדרש מילד קשיחות, הרבה לפני שהיה מוכן לכך.",
      "mem.t3": "קריאה בתורה",
      "mem.b3": "באפריל 1957, הודות לרב טוב לב שהכין אותי, קראתי בתורה בבר המצווה שלי. דודי מוריץ — שיום אחד עתיד היה להציל את חיי — העניק לי מגן דוד מזהב. לראשונה ניגש אליי סבי בגאווה שקטה.",
      "mem.t4": "חוש הישרדות",
      "mem.b4": "כניצול שואה שחזה באכזריות נוראה, הרחוב לימד אותי להגן על עצמי. הייתי חד יותר מהנערים האחרים, וניצלתי את שכלי כדי להישאר צעד אחד קדימה — עד שהוריי, מחשש לעתידי, שלחו אותי לגור אצל דודי מוריץ ביפו.",
      "mem.t5": "לוחם ומפקד",
      "mem.b5": "במאי 1962 התגייסתי לצבא כלוחם. שירתתי בקרב, סיימתי את קורס קציני הקרב, ופיקדתי על פלוגה. הילד משבזי הפך למנהיג — והסיפור רק החל.",
      "mem.t6": "הסיפור נמשך…",
      "mem.b6": "חיים שלמים של משפחה, נכדים ואהבה עדיין ממתינים להיכתב כאן — פרק אחר פרק, בקולו שלו.",
      "mem.cta": "← עזרו להנציח את הפרק הבא",

      "gal.kicker": "פרק רביעי",
      "gal.title": "חיים בתצלומים",
      "gal.sub": "רגעים, מקומות, והאנשים שחשובים",

      "leg.quote": "יש סיפורים חשובים מכדי להישכח. נועדו הם להישמר, לעבור מדור לדור, ולהיות יקרים — למען הילדים, הנכדים, וכל מי שיבוא אחריהם.",
      "leg.attr": "— לבה של 'בלתי נשכח'",

      "cta.kicker": "למשפחות ולמספרי סיפורים",
      "cta.title": "הנציחו סיפור שיישאר לנצח",
      "cta.lede": "לכל משפחה יש סיפור בלתי נשכח. אנו הופכים זיכרונות, מכתבים ותצלומים למזכרת דיגיטלית חיה ויפה — מעוצבת בקפידה, בנויה להחזיק מעמד, ומוכנה לשיתוף עם הדורות הבאים.",
      "cta.f1": "עיצוב אלגנטי ומותאם אישית",
      "cta.f2": "צירי זמן ופרקים אינטראקטיביים",
      "cta.f3": "גלריות תמונות ווידאו",
      "cta.f4": "שיתוף פרטי או ציבורי",
      "cta.formTitle": "בואו נתחיל לשוחח",
      "cta.name": "שמך",
      "cta.email": "כתובת אימייל",
      "cta.msg": "ספרו לנו על הסיפור שתרצו להנציח",
      "cta.send": "שליחת פנייה",
      "cta.sent": "נשלח",
      "cta.note": "תודה — נחזור אליכם בקרוב. ♥",

      "ph.addPhoto": "הוסיפו תמונה",
      "ph.here": "התמונה שלכם כאן",
      "cap.firstPhoto": "התצלום הראשון שלהם יחד",
      "cap.telaviv": "תל אביב, 2012",
      "cap.besor": "נחל הבשור",
      "cap.london": "לונדון, יוני 2012",
      "cap.la": "קיץ בלוס אנג'לס",
      "cap.family": "משפחה",

      "footer.copy": "© " + YEAR + " בלתי נשכח · סיפורם של רחלי וצביקה",
      "footer.credit": "מזכרת שנוצרה באהבה."
    }
  };

  var STORAGE_KEY = "uy_lang";

  function apply(lang) {
    if (!T[lang]) lang = "en";
    var dict = T[lang];
    var doc = document.documentElement;

    doc.setAttribute("lang", lang);
    doc.setAttribute("dir", lang === "he" ? "rtl" : "ltr");

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (dict[key] != null) el.innerHTML = dict[key];
    });

    // Reflect active state on the toggle
    document.querySelectorAll(".lang-toggle__opt").forEach(function (opt) {
      opt.classList.toggle("is-active", opt.getAttribute("data-lang") === lang);
    });

    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    window.UY_LANG = lang;
    document.dispatchEvent(new CustomEvent("uy:langchange", { detail: { lang: lang } }));
  }

  function init() {
    var saved = "en";
    try { saved = localStorage.getItem(STORAGE_KEY) || "en"; } catch (e) {}
    apply(saved);

    var toggle = document.getElementById("langToggle");
    if (toggle) {
      toggle.addEventListener("click", function () {
        apply((window.UY_LANG === "he") ? "en" : "he");
      });
    }
  }

  // Expose for other scripts
  window.UY_I18N = { apply: apply, dict: T };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
