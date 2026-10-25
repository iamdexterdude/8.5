# Marking the "nice chunks of language" in an answer, the way the course does (light green):
#   1. phrases the teacher listed in the vocabulary notes under the answer
#   2. phrases the teacher put in bold or in red
#   3. for answers with no marks at all, a curated list of high-value spoken chunks
import re

FALLBACK = """hands down|spoilt for choice|spoiled for choice|a breath of fresh air|once in a blue moon|by and large|more often than not|to be honest|all in all|
at the end of the day|every now and then|now and then|in the long run|keep up with|look forward to|put up with|end up|figure out|work out|turn out|take up|
pick up|cut down on|go for|get by|on the whole|it goes without saying|needless to say|a far cry from|the icing on the cake|a piece of cake|hit the sack|
run errands|take a nap|chill out|unwind|a sense of|in terms of|when it comes to|a wide range of|plenty of|loads of|heaps of|piles of|tonnes of|tons of|a bunch of|
a handful of|way too|far too|pretty much|to be fair|frankly speaking|if I'm honest|let alone|not to mention|on top of that|apart from|as far as I'm concerned|
I'd say|I reckon|state-of-the-art|cutting-edge|run-of-the-mill|second to none|up to scratch|on the go|in a nutshell|the bottom line|a no-brainer|a game-changer|
a game changer|a win-win|hustle and bustle|peace and quiet|wear and tear|bits and bobs|odds and ends|sick and tired|safe and sound|trial and error|pros and cons|
ups and downs|back and forth|now and again|a stone's throw|off the beaten track|in the middle of nowhere|the talk of the town|a hidden gem|a tourist trap|
jam-packed|packed to the rafters|a must-see|a must-have|get the hang of|get a kick out of|be into|keen on|fond of|hooked on|addicted to|can't get enough of|
a big fan of|not my cup of tea|not my thing|a soft spot for|over the moon|on cloud nine|tickled pink|down in the dumps|under the weather|a blessing in disguise|
a mixed blessing|a double-edged sword|the best of both worlds|cost an arm and a leg|a rip-off|a bargain|value for money|break the bank|splash out|make ends meet|
set aside|put aside|save up|fork out|on a shoestring|a last resort|in the nick of time|at the eleventh hour|around the clock|burn the midnight oil|call it a day|
a night owl|an early bird|an early riser|a morning person|sleep in|lie in|stay up late|take it easy|let off steam|blow off steam|recharge my batteries|a breather|
a change of scenery|get away from it all|a getaway|hit the road|off the top of my head|ring a bell|slip my mind|on the tip of my tongue|lose track of time|
kill time|in my spare time|in my free time|keep fit|stay in shape|out of shape|a couch potato|work out|hit the gym|a balanced diet|junk food|comfort food|
a sweet tooth|home-cooked|mouth-watering|a foodie|eat out|grab a bite|a bite to eat|wolf down|a picky eater|a social butterfly|an introvert|an extrovert|
outgoing|easy-going|easygoing|laid-back|down-to-earth|level-headed|open-minded|narrow-minded|a people person|get on well with|hit it off|see eye to eye|
fall out with|keep in touch|lose touch|close-knit|tight-knit|go way back|through thick and thin|a shoulder to cry on|look up to|a role model|in the same boat|
on the same page|speak volumes|hit the nail on the head|a steep learning curve|learn the ropes|get to grips with|brush up on|a bookworm|a page-turner|
a must-read|binge-watch|a box-office hit|a blockbuster|a flop|a letdown|live up to the hype|hyped up|a cliffhanger|a plot twist|on the edge of my seat|
a tearjerker|feel-good|thought-provoking|rush hour|stuck in traffic|a traffic jam|bumper to bumper|get around|a stone's throw|within walking distance|
on my doorstep|a hassle|a pain in the neck|a nightmare|hassle-free|hands-on|a knack for|a natural at|a good eye for|an ear for|a green thumb|green-fingered|
a quick learner|a tough nut to crack|a walk in the park|an uphill struggle|a tall order|nail it|pass with flying colours|pass with flying colors|out of the blue|
all of a sudden|in the blink of an eye|time flies|before you know it|in this day and age|back in the day|the good old days|a thing of the past|here to stay|
on the rise|the way forward|a vicious circle|a catch-22|a grey area|a hot topic|a burning issue|food for thought|it boils down to|it comes down to|it depends on|
by the same token|on the flip side|on the other hand|having said that|that said|all things considered|when all is said and done|a far cry|in a rush|
take my time|make the most of|make up for|come across|come up with|get rid of|get over|get through|go through|carry on|give up|look after|take care of|
sort out|stick to|stand out|show off|drop by|pop in|catch up with|hang out with|hang out|meet up with|get together|a get-together|mind-blowing|jaw-dropping|
breathtaking|stunning|gorgeous|picturesque|cosy|cozy|spacious|cramped|a godsend|a lifesaver|a must|second nature|a daily grind|the daily grind|
a nine-to-five|a dead-end job|climb the career ladder|a career path|a dream job|a steady job|a well-paid job|job satisfaction|work-life balance|
burn out|burnout|a workaholic|multitask|prioritise|prioritize|procrastinate|a to-do list|tick off|cross off|get down to|knuckle down|a rough patch|
a turning point|a milestone|a wake-up call|a reality check|a learning curve|take for granted|a big deal|not a big deal|make a big deal of|
a sense of community|a sense of achievement|a sense of belonging|peer pressure|a close call|a near miss|play it safe|take risks|a risk-taker|
step out of my comfort zone|out of my comfort zone|push myself|go the extra mile|give it a shot|give it a go|have a go|worth a try|worth a shot|
a once-in-a-lifetime|a rite of passage|a fresh start|turn over a new leaf|a clean slate|from scratch|the ins and outs|the nuts and bolts|
in the grand scheme of things|the big picture|the bigger picture|a rule of thumb|more or less|give or take|to some extent|to a certain extent|
by far|without a doubt|without a shadow of a doubt|beyond doubt|for the most part|first and foremost|last but not least|to put it simply|
to put it another way|in other words|that is to say|as a matter of fact|in fact|as a rule|generally speaking|broadly speaking|roughly speaking|
strictly speaking|technically speaking|to tell the truth|truth be told|to be perfectly honest|I must admit|I have to admit|I must say|I'd go so far as to say|
I wouldn't go so far as to say|it's safe to say|it's fair to say|it's no exaggeration to say|I'm not going to lie|not going to lie|you name it|and the like|
and so on|and so forth|and what not|and whatnot|you know what I mean|if you know what I mean|if that makes sense|does that make sense|
the thing is|here's the thing|the thing about|what I love about|what I like most about|what strikes me|what stands out|the main reason|
the reason behind|the reason why|that's why|which is why|hence|therefore|as a result|consequently|in turn|in the end|eventually|ultimately|
in the meantime|meanwhile|in the short term|in the long term|down the line|down the road|in the foreseeable future|sooner or later|
at some point|at one point|at the time|back then|these days|nowadays|at the moment|right now|for the time being|for now|as of now|
in no time|in a flash|in a heartbeat|at a moment's notice|on the spot|on the spur of the moment|spur-of-the-moment|last-minute|
a fair amount of|a great deal of|a good deal of|a considerable amount of|quite a few|quite a lot of|a fair few|a couple of|a number of|
the vast majority of|the bulk of|a fraction of|a tiny minority of|next to nothing|next to impossible|virtually|practically|literally|
absolutely|utterly|thoroughly|genuinely|particularly|especially|incredibly|remarkably|surprisingly|unsurprisingly|admittedly|arguably|
undoubtedly|undeniably|inevitably|essentially|basically|fundamentally|ultimately|apparently|presumably|supposedly|allegedly""".replace("\n", "")

def _pattern(phrase):
    words = phrase.strip().split()
    parts = []
    for i, w in enumerate(words):
        w = re.escape(w)
        if i == 0 and w in ("a", "an", "the"): parts.append(r"(?:a|an|the)?\s*"); continue
        w = re.sub(r"^(my|your|his|her|their|our)$", r"(?:my|your|his|her|their|our)", w)
        parts.append(w + r"(?:s|es|ed|d|ing|er|est)?")
    return r"(?<![\w-])" + r"\s+".join(p for p in parts if p) + r"(?![\w-])"

FALLBACK_RX = [re.compile(_pattern(p), re.I) for p in FALLBACK.split("|") if p.strip()]

def term_rx(term):
    t = re.sub(r"^(to|a|an|the)\s+", "", term.strip().strip("'\"“”‘’.,;:!?()").lower())
    t = re.sub(r"\s*\(.*?\)\s*", " ", t)                       # "to be ___ (informal)"
    t = re.sub(r"\b(smth|sth|somebody|sb|someone|something|smb)\b", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) < 3 or len(t.split()) > 7: return None
    return re.compile(_pattern(t), re.I)

def mark_chunks(runs, patterns):
    """runs -> runs with matched spans given h='chunk' (only where no highlight is set); bold is kept"""
    if not runs or not patterns: return runs
    text = "".join(r["t"] for r in runs)
    taken = [False] * len(text)
    for rx in patterns:
        for m in rx.finditer(text):
            a, b = m.start(), m.end()
            if b - a < 3 or any(taken[a:b]): continue
            for i in range(a, b): taken[i] = True
    if not any(taken): return runs
    out, pos = [], 0
    for r in runs:
        seg = r["t"]; n = len(seg)
        if r.get("h"): out.append(r); pos += n; continue
        i = 0
        while i < n:
            j = i
            while j < n and taken[pos + j] == taken[pos + i]: j += 1
            piece = dict(r); piece["t"] = seg[i:j]
            if taken[pos + i]:
                piece["h"] = "chunk"
                core = piece["t"].rstrip()
                if core != piece["t"]:                       # keep the trailing space outside the highlight
                    tail = dict(r); tail["t"] = piece["t"][len(core):]; piece["t"] = core
                    out.append(piece); out.append(tail); i = j; continue
            out.append(piece); i = j
        pos += n
    return out
