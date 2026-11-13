-- Conversation starters. The server picks three per connection (D6).
--
-- Written to be answerable by a stranger in two minutes, at a party, without
-- anyone having to be clever or reveal anything personal. Nothing about
-- grades, money, relationships or family. A few are specific to the society
-- and the university, which is what makes them feel like the event's own
-- rather than a list from the internet.
--
-- Swap any of these for better ones — they are data, not code:
--   update starters set active = false where id = 12;
--   insert into starters (text) values ('...');

insert into starters (text) values
  ('What is something you changed your mind about this year?'),
  ('Which class surprised you most this semester, and why?'),
  ('What is the best thing you have read or watched lately?'),
  ('If you had to teach one subject tomorrow, what would it be?'),
  ('What is a small thing that reliably improves your day?'),
  ('What is something you are better at than you expected to be?'),
  ('Which part of campus do you actually like being in?'),
  ('What would you add to the Econ Gala if you were running it?'),
  ('What is a skill you want to have by this time next year?'),
  ('What is the most useful thing you have learned outside a classroom?'),
  ('Which economist or idea do you find genuinely overrated?'),
  ('What is a question you wish people asked you more often?'),
  ('What did you want to be when you were ten?'),
  ('What is the best advice you have been given that you ignored?'),
  ('Which app or tool do you open most, and do you want to?'),
  ('What is something you believe that most of your friends do not?'),
  ('What would you do with a free year and no obligations?'),
  ('What is a place in this city you think is underrated?'),
  ('What is the last thing you made with your hands?'),
  ('Which habit have you actually managed to keep?'),
  ('What is something small you spend money on and never regret?'),
  ('If you could undo one piece of technology, what would it be?'),
  ('What is a compliment you remember getting?'),
  ('What is the most interesting thing about where you grew up?'),
  ('Which fictional character do you find annoyingly relatable?'),
  ('What is a problem you would like to spend your career on?'),
  ('What is something you used to find difficult and now do easily?'),
  ('Which group chat is your most active, and what is it about?'),
  ('What is the best meal you have had in the last month?'),
  ('What is a rule you follow that nobody asked you to follow?'),
  ('What is something worth queueing for?'),
  ('Which subject do you wish you had taken instead?'),
  ('What is a piece of advice you would give a first-year student?'),
  ('What is the longest you have spent on something that went nowhere?'),
  ('What do you think will be very different in ten years?'),
  ('What is a thing you own that you would replace immediately if lost?'),
  ('Which of your opinions has most changed since starting university?'),
  ('What is something you find interesting that most people find boring?'),
  ('What is the last thing that made you properly laugh?'),
  ('If this evening goes well, what would have made it good?')
on conflict do nothing;
