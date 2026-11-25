function conversation({ message, previous, faq, clinic }) {
  const digits = value => value.replace(/[٠-٩۰-۹]/g, digit =>
    String('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹'.indexOf(digit) % 10));
  const text = digits(message.text.normalize('NFKC')).trim();
  const word = text.toLowerCase();
  const language = /\p{Script=Arabic}/u.test(text) ? 'ar'
    : /[a-z]/i.test(text) && (!previous?.step || /^(hi|hello|menu|cancel)$/i.test(text)) ? 'en'
    : previous?.language ?? 'en';
  const say = (en, ar) => language === 'ar' ? ar : en;
  const menu = say(
    `Welcome to ${clinic.name.en} (demo). Reply with a number:\n1. Services & prices\n2. Hours & location\n3. Request an appointment\n4. Talk to the clinic`,
    `أهلاً بك في ${clinic.name.ar} (عرض تجريبي). اختر رقماً:\n١. الخدمات والأسعار\n٢. المواعيد والعنوان\n٣. طلب موعد\n٤. التواصل مع العيادة`,
  );
  const state = { ...previous, language };
  const respond = (reply, event) => ({ state, reply, event });
  const reset = () => {
    delete state.step;
    delete state.name;
    delete state.phone;
  };
  if (/^(menu|hi|hello|القائمة|مرحبا|أهلا|اهلا|السلام عليكم)$/.test(word) && (!state.step || /^(menu|القائمة)$/.test(word))) {
    reset();
    return respond(menu);
  }
  if (/^(cancel|إلغاء|الغاء)$/.test(word)) {
    reset();
    return respond(menu);
  }
  if (!previous) {
    state.lastText = text.slice(0, 500);
    return respond(menu);
  }
  const services = clinic.services.map(id => faq.find(item => item.id === id));
  if (state.step === 'name') {
    if (text.length > 80 || !/^\p{L}[\p{L}\p{M} .'-]+$/u.test(text)) {
      return respond(say('Please enter your name.', 'من فضلك اكتب اسمك.'));
    }
    state.name = text;
    state.step = 'phone';
    return respond(say('What is your phone number? Include the country code, e.g. +201000000000.', 'ما رقم هاتفك؟ اكتب كود الدولة، مثلاً ‎+201000000000.'));
  }
  const exampleSlot = () => {
    const date = new Date(message.timestamp);
    do {
      date.setUTCDate(date.getUTCDate() + 1);
    } while (!clinic.openDays.includes(date.getUTCDay()));
    return `1 ${date.toISOString().slice(0, 10)} ${clinic.opensAt}`;
  };
  if (state.step === 'phone') {
    const phone = text.replace(/[ ()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      return respond(say('Please enter a valid phone number with its country code.', 'من فضلك اكتب رقم هاتف صحيح مع كود الدولة.'));
    }
    state.phone = phone;
    state.step = 'slot';
    const choices = services.map((item, index) => `${index + 1}. ${item[language].question}`).join('\n');
    return respond(say(
      `Send the service number, date and Cairo time in one message, like: ${exampleSlot()}\n${choices}`,
      `أرسل رقم الخدمة والتاريخ والوقت بتوقيت القاهرة في رسالة واحدة، مثلاً: ${exampleSlot()}\n${choices}`,
    ));
  }
  if (state.step === 'slot') {
    const match = /^(\d{1,2})\s+(\d{4}-\d{2}-\d{2})\s+((?:[01]\d|2[0-3]):[0-5]\d)$/.exec(text);
    const service = match && services[Number(match[1]) - 1];
    const date = match && new Date(`${match[2]}T00:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: clinic.timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(message.timestamp));
    const now = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const valid = service && Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === match[2]
      && clinic.openDays.includes(date.getUTCDay()) && match[3] >= clinic.opensAt && match[3] < clinic.closesAt
      && `${match[2]} ${match[3]}` > `${now.year}-${now.month}-${now.day} ${now.hour}:${now.minute}`;
    if (!valid) {
      return respond(say(
        `Please send a service number and a future date and time during opening hours (${clinic.opensAt}–${clinic.closesAt}), e.g. ${exampleSlot()}.`,
        `من فضلك أرسل رقم خدمة وتاريخ ووقت في المستقبل خلال ساعات العمل (${clinic.opensAt}–${clinic.closesAt})، مثلاً: ${exampleSlot()}.`,
      ));
    }
    const event = {
      type: 'booking', name: state.name, phone: state.phone, service: service.id,
      slot: `${match[2]} ${match[3]}`, timeZone: clinic.timeZone,
    };
    reset();
    return respond(say(
      `Thanks, ${event.name}. We received your request for ${service.en.question} on ${event.slot} (Cairo time), phone ${event.phone}. The clinic will contact you to confirm.\n\n${menu}`,
      `شكراً يا ${event.name}. استلمنا طلب ${service.ar.question} يوم ${event.slot} بتوقيت القاهرة، رقم الهاتف ${event.phone}. ستتواصل معك العيادة للتأكيد.\n\n${menu}`,
    ), event);
  }
  if (word === '1' || word === '2') {
    const entries = word === '1' ? services : faq.filter(item => ['hours', 'location'].includes(item.id));
    const answers = entries.map(item => item[language].answer).join('\n');
    return respond(`${answers}\n\n${menu}`);
  }
  if (word === '3') {
    state.step = 'name';
    return respond(say('What is your name? Send “cancel” any time to return to the menu.', 'ما اسمك؟ أرسل «إلغاء» في أي وقت للرجوع للقائمة.'));
  }
  if (word === '4') {
    return respond(say(
      'I’ve passed your message to the clinic team. A person will reply as soon as they can.',
      'حوّلت رسالتك لفريق العيادة. أحد أفراد الفريق هيرد عليك في أقرب وقت.',
    ), { type: 'handoff', message: previous?.lastText || text });
  }
  state.lastText = text.slice(0, 500);
  const words = word.split(/[^\p{L}\p{N}-]+/u).join(' ');
  const answer = faq.find(item => item.keywords.some(keyword => ` ${words} `.includes(` ${keyword} `)));
  if (answer) return respond(`${answer[language].answer}\n\n${menu}`);
  return respond(say(`I didn’t catch that.\n\n${menu}`, `لم أفهم الرسالة.\n\n${menu}`));
}

module.exports = { conversation };
