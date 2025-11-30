const blogData = [
  {
    id: '8020-rule',
    title: 'The 80/20 Rule of Sales Time',
    date: 'Nov 29, 2025',
    summary: 'Why the top 20% of reps generate 80% of results and how to flip your time split.',
    body: `In almost every sales organization, the top 20% of sales reps consistently generate around 80% of the results. This isn't just because they are more talented; it's because they use their time differently. The average sales rep's day can be divided into two main categories: selling and non-selling activities. Selling activities are things like prospecting, booking meetings, running demos, and asking for the business. Non-selling activities are admin tasks, managing internal affairs, writing repetitive emails, chasing information, and getting ready to sell. For many reps, this time split ends up being roughly 20% selling and 80% non-selling. The top performers flip that equation as much as possible. They look for ways to spend more time in real sales conversations and less time buried in busywork.

Sales is a difficult job. Prospects reschedule, inboxes fill up, tools don't always talk to each other, and it can feel like the day disappears before you've done any real selling. But the number one way to get ahead is not working longer hours; it's maximizing your selling time during the hours you already have. That means protecting your calendar, batching your admin, and using systems and tools to handle as many repetitive tasks as possible. Someone at Google once said that if you have to do something more than three times, it should be automated. Top reps live by that idea. Every repetitive email, every manual follow-up, every copy-and-paste task is an opportunity to free up time for another call, another demo, another proposal.

This tool is designed to help you do exactly that: increase and automate your activity so you can focus on the part of the job that actually moves the needle. By automating prospecting steps and your regular emails, it reduces the mental load of remembering who to follow up with and when. Instead of hunting through old notes and spreadsheets, you can quickly see where every deal is in your funnel and what needs to happen next. The goal is simple: help you keep track of your pipeline, stay on top of your business, and shift more of your day from non-selling to selling activities. When you do that consistently, you put yourself in the position where the top 20% live where your results compound, your confidence grows, and your numbers begin to separate you from the pack.

If anything this tool should help you send more prospecting emails and protect your mental energy against repetitive emails.`
  },
  {
    id: 'power-of-systems',
    title: 'The Power of Systems',
    date: 'Nov 21, 2025',
    summary: 'Why structure, discipline, and reflection outperform talent and motivation in sales.',
    body: `In sales, it is easy to believe that talent, charisma, or a few big deals are what separate top performers from everyone else. In reality, the real advantage is much quieter and less glamorous: systems, discipline, and reflection. These three ingredients, when combined, create a structure that carries you through the emotional highs and lows of sales and keeps you moving even when the results are not showing up yet.

Sales is a constant mental battle. You can prospect all month and feel like nothing is happening. You can run a great meeting, give your best presentation, and still hear "no." Unlike many jobs where effort and results are closely linked day to day, sales often pays you with a delay. The calls you make this week might not show up in your commission statement for three, six, or even twelve months. That delay is where most people lose. They stop doing the work because they are not yet seeing the reward.

This is where systems become powerful. A system is simply a repeatable process that removes decision-making and emotion from the basics. Instead of waking up and asking, "What should I do today?" a good system tells you, "Here’s what you do every day, no matter how you feel."

A simple sales system might include:

A fixed number of new outbound touches per day (calls, emails, LinkedIn messages).

A set block of time for follow-ups and pipeline management.

A weekly review where you look at your numbers, wins, and losses.

A consistent routine for preparing before each call or meeting.

When you follow a system, you do not depend on motivation. You depend on structure. Motivation comes and goes; structure stays.

Discipline is what keeps you in the system. It is the decision to follow your plan even when you are tired, discouraged, or distracted. Discipline is not about being perfect every day; it is about showing up more consistently than the average salesperson. The average rep lets their calendar be controlled by emotions and external events. A disciplined rep protects their prospecting time like a meeting with their biggest client. They understand that future deals are born in the quiet, boring hours of steady activity.

Over time, discipline compounds. Making ten extra quality calls per day does not seem like much, but over a month that is 200 extra calls, and over a year it is thousands of additional conversations. Somewhere in those extra conversations are the deals that separate an average income from an exceptional one. This is why money follows success, and success follows discipline and systems.

Reflection is the third key. Systems and discipline keep you moving, but reflection makes sure you are moving in the right direction. Without reflection, you can work very hard and still repeat the same mistakes. Reflection is the habit of stepping back to ask:

What worked this week?

What did not work?

Where did you hesitate?

What objections kept coming up?

What part of your process feels messy or unclear?

This can be done in a short weekly review. Look at your numbers, your meetings, and your pipeline. Identify one small improvement for the coming week: a better opening line, a clearer discovery question, a tighter follow-up email, or a more focused prospect list. Over time, these small adjustments turn into major performance gains.

Systems provide the framework. Discipline powers the execution. Reflection fine-tunes the direction.

The truth is that most salespeople are capable of much more than they are achieving right now. The gap is rarely talent; it is structure. Without systems, every day feels random. Without discipline, your calendar fills with low-value activity. Without reflection, your mistakes repeat themselves and your growth stalls.

Sales will always be mentally challenging. There will always be rejection, uncertainty, and delayed rewards. You cannot control exactly when the money shows up, but you can control the inputs you bring every day. When you commit to strong systems, consistent discipline, and honest reflection, you build a career where results are not a surprise. They are the natural, delayed outcome of the work you have been doing all along.`
  }
];

function renderBlogCards() {
  const list = document.getElementById('blogList');
  if (!list) return;
  list.innerHTML = blogData
    .map(
      (post) => `
      <article class="home-blog-card" data-blog-id="${post.id}">
        <p class="home-blog-meta">${post.date}</p>
        <h3>${post.title}</h3>
        <p class="home-text">${post.summary}</p>
        <button type="button" class="home-login-btn home-blog-read" data-blog-id="${post.id}">Read</button>
      </article>`
    )
    .join('');
}

function openBlogModal(post) {
  const modal = document.getElementById('blogModal');
  const title = document.getElementById('blogModalTitle');
  const body = document.getElementById('blogModalBody');
  const date = document.getElementById('blogModalDate');
  if (!modal || !title || !body || !date) return;
  title.textContent = post.title;
  date.textContent = post.date;
  body.innerHTML = post.body.replace(/\n/g, '<br><br>');
  modal.classList.remove('hidden');
}

function closeBlogModal() {
  const modal = document.getElementById('blogModal');
  if (modal) modal.classList.add('hidden');
}

function wireBlogEvents() {
  const list = document.getElementById('blogList');
  const closeBtn = document.getElementById('closeBlogModal');
  const modal = document.getElementById('blogModal');
  if (list) {
    list.addEventListener('click', (e) => {
      const target = e.target.closest('[data-blog-id]');
      if (!target) return;
      const id = target.getAttribute('data-blog-id');
      const post = blogData.find((p) => p.id === id);
      if (post) openBlogModal(post);
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closeBlogModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeBlogModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeBlogModal();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  renderBlogCards();
  wireBlogEvents();
});
