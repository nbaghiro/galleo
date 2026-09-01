import type { ArtifactContent, ElementInstance } from "@model/artifact";
import type { Template } from "@model/templates";
import { TEMPLATE_INDEX } from "@model/templates";
import {
    badge,
    bgImage,
    bgTone,
    bullets,
    button,
    callout,
    card,
    chart,
    checks,
    col,
    cta,
    deck,
    diagram,
    divider,
    doc,
    faq,
    feature,
    fill,
    fitW,
    group,
    img,
    linked,
    menu,
    middle,
    pin,
    polaroid,
    pricing,
    profile,
    quote,
    row,
    section,
    split,
    stat,
    t,
    table,
    tabs,
    testimonial,
    video,
    w,
    web,
} from "@model/authoring";

// The starter-template bodies, hand-authored with the @model/authoring DSL and grouped by the same
// category the index uses. @model/templates carries the client-facing half (ids, labels, grouping);
// this file is the other half, plus the id → body resolution the /templates route and the seed use.

//
// The nav is one flat row: a nested one would reflow to a column at the share of the width it would
// get. The brand takes the slack, which is what puts the links hard right without a justify rule.
// Every nav band carries a solid colour of its own, since a pinned section is painted over whatever
// scrolls beneath it.

const siteNav = (brand: string, ...items: ElementInstance[]): ElementInstance => ({
    ...row({ align: "center" }, fill(t(brand, "label")), ...items.map((i) => fitW(i))),
    layout: { dock: "top" },
});

const navLink = (label: string, href: string): ElementInstance =>
    button(label, href, { variant: "ghost", size: "sm" });

const navCta = (label: string, href: string): ElementInstance =>
    button(label, href, { variant: "filled", size: "sm", shape: "pill" });

// A real, long-lived URL so the demo section actually plays for someone who publishes the template
// before swapping in their own footage; the poster beside it is what every static surface paints.
// Must be an ordinary upload, never a live stream: YouTube embeds a stream's recording as
// "Video unavailable" once the stream rotates.
// A hand-picked photo from the Lorem Picsum catalog, addressed by its stable id, so a template's
// imagery is chosen rather than hashed: the seed form hands back an arbitrary photo, and an
// arbitrary photo is how a furniture studio ends up illustrated by a jellyfish.
// One entry per call site, chosen for the copy around it. Pexels rather than Unsplash: its licence
// lets us hold the bytes when template imagery moves to our own storage, and it asks for no credit.
const PHOTOS: Record<number, string> = {
    // Resume / CV
    1: "https://images.pexels.com/photos/15626630/pexels-photo-15626630.jpeg",
    2: "https://images.pexels.com/photos/28532744/pexels-photo-28532744.jpeg",
    3: "https://images.pexels.com/photos/27668992/pexels-photo-27668992.jpeg",
    4: "https://images.pexels.com/photos/20303270/pexels-photo-20303270.jpeg",
    // Portfolio
    5: "https://images.pexels.com/photos/8407574/pexels-photo-8407574.jpeg",
    6: "https://images.pexels.com/photos/6568664/pexels-photo-6568664.jpeg",
    7: "https://images.pexels.com/photos/28614771/pexels-photo-28614771.jpeg",
    8: "https://images.pexels.com/photos/28247932/pexels-photo-28247932.jpeg",
    9: "https://images.pexels.com/photos/36595323/pexels-photo-36595323.jpeg",
    10: "https://images.pexels.com/photos/11406429/pexels-photo-11406429.jpeg",
    11: "https://images.pexels.com/photos/15301096/pexels-photo-15301096.jpeg",
    12: "https://images.pexels.com/photos/7045354/pexels-photo-7045354.jpeg",
    13: "https://images.pexels.com/photos/31771243/pexels-photo-31771243.jpeg",
    14: "https://images.pexels.com/photos/7608683/pexels-photo-7608683.jpeg",
    15: "https://images.pexels.com/photos/9616927/pexels-photo-9616927.jpeg",
    16: "https://images.pexels.com/photos/17491757/pexels-photo-17491757.jpeg",
    // Personal Site
    17: "https://images.pexels.com/photos/35983705/pexels-photo-35983705.jpeg",
    18: "https://images.pexels.com/photos/4271613/pexels-photo-4271613.jpeg",
    19: "https://images.pexels.com/photos/763135/pexels-photo-763135.jpeg",
    20: "https://images.pexels.com/photos/38978902/pexels-photo-38978902.jpeg",
    21: "https://images.pexels.com/photos/5095576/pexels-photo-5095576.jpeg",
    // Cover Letter
    22: "https://images.pexels.com/photos/7424583/pexels-photo-7424583.jpeg",
    23: "https://images.pexels.com/photos/28056608/pexels-photo-28056608.jpeg",
    24: "https://images.pexels.com/photos/1046403/pexels-photo-1046403.jpeg",
    25: "https://images.pexels.com/photos/15222306/pexels-photo-15222306.jpeg",
    // Event Invite
    26: "https://images.pexels.com/photos/38928225/pexels-photo-38928225.jpeg",
    27: "https://images.pexels.com/photos/28494742/pexels-photo-28494742.jpeg",
    28: "https://images.pexels.com/photos/13059659/pexels-photo-13059659.jpeg",
    29: "https://images.pexels.com/photos/32468906/pexels-photo-32468906.png",
    30: "https://images.pexels.com/photos/19986458/pexels-photo-19986458.jpeg",
    31: "https://images.pexels.com/photos/38814152/pexels-photo-38814152.jpeg",
    32: "https://images.pexels.com/photos/10598388/pexels-photo-10598388.jpeg",
    33: "https://images.pexels.com/photos/7405768/pexels-photo-7405768.jpeg",
    34: "https://images.pexels.com/photos/4993964/pexels-photo-4993964.jpeg",
    35: "https://images.pexels.com/photos/10360901/pexels-photo-10360901.jpeg",
    36: "https://images.pexels.com/photos/39072312/pexels-photo-39072312.jpeg",
    37: "https://images.pexels.com/photos/33557773/pexels-photo-33557773.jpeg",
    // Photo Essay
    38: "https://images.pexels.com/photos/31254345/pexels-photo-31254345.jpeg",
    39: "https://images.pexels.com/photos/3544024/pexels-photo-3544024.jpeg",
    40: "https://images.pexels.com/photos/28665520/pexels-photo-28665520.jpeg",
    41: "https://images.pexels.com/photos/8193091/pexels-photo-8193091.jpeg",
    42: "https://images.pexels.com/photos/5800341/pexels-photo-5800341.jpeg",
    43: "https://images.pexels.com/photos/5854264/pexels-photo-5854264.jpeg",
    44: "https://images.pexels.com/photos/34942811/pexels-photo-34942811.jpeg",
    45: "https://images.pexels.com/photos/4000528/pexels-photo-4000528.jpeg",
    46: "https://images.pexels.com/photos/9877700/pexels-photo-9877700.jpeg",
    47: "https://images.pexels.com/photos/37020525/pexels-photo-37020525.jpeg",
    48: "https://images.pexels.com/photos/13937492/pexels-photo-13937492.jpeg",
    49: "https://images.pexels.com/photos/7147393/pexels-photo-7147393.jpeg",
    50: "https://images.pexels.com/photos/11534866/pexels-photo-11534866.jpeg",
    // Product Launch
    51: "https://images.pexels.com/photos/6738989/pexels-photo-6738989.jpeg",
    52: "https://images.pexels.com/photos/38883107/pexels-photo-38883107.jpeg",
    53: "https://images.pexels.com/photos/8668767/pexels-photo-8668767.jpeg",
    54: "https://images.pexels.com/photos/15485973/pexels-photo-15485973.jpeg",
    55: "https://images.pexels.com/photos/9123787/pexels-photo-9123787.jpeg",
    56: "https://images.pexels.com/photos/8093107/pexels-photo-8093107.jpeg",
    57: "https://images.pexels.com/photos/5217124/pexels-photo-5217124.jpeg",
    58: "https://images.pexels.com/photos/26535233/pexels-photo-26535233.jpeg",
    59: "https://images.pexels.com/photos/6036671/pexels-photo-6036671.jpeg",
    60: "https://images.pexels.com/photos/1410227/pexels-photo-1410227.jpeg",
    61: "https://images.pexels.com/photos/11705368/pexels-photo-11705368.jpeg",
    62: "https://images.pexels.com/photos/8945688/pexels-photo-8945688.jpeg",
    // Landing Page
    63: "https://images.pexels.com/photos/1702975/pexels-photo-1702975.jpeg",
    64: "https://images.pexels.com/photos/37245159/pexels-photo-37245159.jpeg",
    65: "https://images.pexels.com/photos/10655907/pexels-photo-10655907.jpeg",
    66: "https://images.pexels.com/photos/16856001/pexels-photo-16856001.jpeg",
    67: "https://images.pexels.com/photos/29181531/pexels-photo-29181531.jpeg",
    68: "https://images.pexels.com/photos/4072418/pexels-photo-4072418.jpeg",
    69: "https://images.pexels.com/photos/1699588/pexels-photo-1699588.jpeg",
    70: "https://images.pexels.com/photos/7478219/pexels-photo-7478219.jpeg",
    // Event Page
    71: "https://images.pexels.com/photos/12092991/pexels-photo-12092991.jpeg",
    72: "https://images.pexels.com/photos/35755223/pexels-photo-35755223.jpeg",
    73: "https://images.pexels.com/photos/8063875/pexels-photo-8063875.jpeg",
    74: "https://images.pexels.com/photos/3938693/pexels-photo-3938693.jpeg",
    75: "https://images.pexels.com/photos/15988007/pexels-photo-15988007.jpeg",
    76: "https://images.pexels.com/photos/31746947/pexels-photo-31746947.jpeg",
    77: "https://images.pexels.com/photos/1530989/pexels-photo-1530989.jpeg",
    78: "https://images.pexels.com/photos/11666837/pexels-photo-11666837.jpeg",
    79: "https://images.pexels.com/photos/19748924/pexels-photo-19748924.jpeg",
    80: "https://images.pexels.com/photos/13091850/pexels-photo-13091850.jpeg",
    // Waitlist Page
    81: "https://images.pexels.com/photos/10050598/pexels-photo-10050598.jpeg",
    82: "https://images.pexels.com/photos/18672116/pexels-photo-18672116.jpeg",
    83: "https://images.pexels.com/photos/38798400/pexels-photo-38798400.jpeg",
    84: "https://images.pexels.com/photos/19116577/pexels-photo-19116577.jpeg",
    85: "https://images.pexels.com/photos/39126643/pexels-photo-39126643.jpeg",
    86: "https://images.pexels.com/photos/55692/pexels-photo-55692.jpeg",
    87: "https://images.pexels.com/photos/36598108/pexels-photo-36598108.jpeg",
    88: "https://images.pexels.com/photos/31718952/pexels-photo-31718952.jpeg",
    89: "https://images.pexels.com/photos/34819928/pexels-photo-34819928.jpeg",
    90: "https://images.pexels.com/photos/30923401/pexels-photo-30923401.jpeg",
    // Agency Site
    91: "https://images.pexels.com/photos/33659313/pexels-photo-33659313.jpeg",
    92: "https://images.pexels.com/photos/37869150/pexels-photo-37869150.jpeg",
    93: "https://images.pexels.com/photos/7227392/pexels-photo-7227392.jpeg",
    94: "https://images.pexels.com/photos/12602048/pexels-photo-12602048.jpeg",
    95: "https://images.pexels.com/photos/9017623/pexels-photo-9017623.jpeg",
    96: "https://images.pexels.com/photos/8369439/pexels-photo-8369439.jpeg",
    97: "https://images.pexels.com/photos/4553681/pexels-photo-4553681.jpeg",
    98: "https://images.pexels.com/photos/29939683/pexels-photo-29939683.jpeg",
    99: "https://images.pexels.com/photos/18805935/pexels-photo-18805935.jpeg",
    100: "https://images.pexels.com/photos/4348298/pexels-photo-4348298.jpeg",
    101: "https://images.pexels.com/photos/17393436/pexels-photo-17393436.jpeg",
    102: "https://images.pexels.com/photos/10019044/pexels-photo-10019044.jpeg",
    // Newsletter
    103: "https://images.pexels.com/photos/9587604/pexels-photo-9587604.jpeg",
    104: "https://images.pexels.com/photos/23924354/pexels-photo-23924354.jpeg",
    105: "https://images.pexels.com/photos/30817748/pexels-photo-30817748.jpeg",
    106: "https://images.pexels.com/photos/35254120/pexels-photo-35254120.jpeg",
    107: "https://images.pexels.com/photos/783164/pexels-photo-783164.jpeg",
    // Startup Pitch Deck
    108: "https://images.pexels.com/photos/8092571/pexels-photo-8092571.jpeg",
    109: "https://images.pexels.com/photos/2696064/pexels-photo-2696064.jpeg",
    110: "https://images.pexels.com/photos/30027297/pexels-photo-30027297.jpeg",
    111: "https://images.pexels.com/photos/12519455/pexels-photo-12519455.jpeg",
    112: "https://images.pexels.com/photos/8093921/pexels-photo-8093921.jpeg",
    113: "https://images.pexels.com/photos/32911921/pexels-photo-32911921.png",
    114: "https://images.pexels.com/photos/10432857/pexels-photo-10432857.jpeg",
    115: "https://images.pexels.com/photos/8528901/pexels-photo-8528901.jpeg",
    116: "https://images.pexels.com/photos/4253300/pexels-photo-4253300.jpeg",
    117: "https://images.pexels.com/photos/15671410/pexels-photo-15671410.jpeg",
    118: "https://images.pexels.com/photos/7058546/pexels-photo-7058546.jpeg",
    119: "https://images.pexels.com/photos/14295998/pexels-photo-14295998.jpeg",
    // Sales Deck
    120: "https://images.pexels.com/photos/2800121/pexels-photo-2800121.jpeg",
    121: "https://images.pexels.com/photos/635054/pexels-photo-635054.jpeg",
    122: "https://images.pexels.com/photos/7564861/pexels-photo-7564861.jpeg",
    123: "https://images.pexels.com/photos/8858566/pexels-photo-8858566.jpeg",
    124: "https://images.pexels.com/photos/38305357/pexels-photo-38305357.jpeg",
    125: "https://images.pexels.com/photos/7541988/pexels-photo-7541988.jpeg",
    126: "https://images.pexels.com/photos/9229421/pexels-photo-9229421.jpeg",
    127: "https://images.pexels.com/photos/2348359/pexels-photo-2348359.jpeg",
    // Series A Deck
    128: "https://images.pexels.com/photos/7196847/pexels-photo-7196847.jpeg",
    129: "https://images.pexels.com/photos/7859953/pexels-photo-7859953.jpeg",
    130: "https://images.pexels.com/photos/5366572/pexels-photo-5366572.jpeg",
    131: "https://images.pexels.com/photos/34610696/pexels-photo-34610696.jpeg",
    132: "https://images.pexels.com/photos/39253418/pexels-photo-39253418.jpeg",
    133: "https://images.pexels.com/photos/5303020/pexels-photo-5303020.jpeg",
    134: "https://images.pexels.com/photos/1802766/pexels-photo-1802766.jpeg",
    135: "https://images.pexels.com/photos/38257882/pexels-photo-38257882.jpeg",
    136: "https://images.pexels.com/photos/5549602/pexels-photo-5549602.jpeg",
    137: "https://images.pexels.com/photos/31785152/pexels-photo-31785152.jpeg",
    // Product Demo Deck
    138: "https://images.pexels.com/photos/37919436/pexels-photo-37919436.jpeg",
    139: "https://images.pexels.com/photos/7616813/pexels-photo-7616813.jpeg",
    140: "https://images.pexels.com/photos/8386572/pexels-photo-8386572.jpeg",
    141: "https://images.pexels.com/photos/34432772/pexels-photo-34432772.jpeg",
    142: "https://images.pexels.com/photos/17060529/pexels-photo-17060529.jpeg",
    143: "https://images.pexels.com/photos/10718795/pexels-photo-10718795.jpeg",
    144: "https://images.pexels.com/photos/7706489/pexels-photo-7706489.jpeg",
    145: "https://images.pexels.com/photos/31020856/pexels-photo-31020856.jpeg",
    146: "https://images.pexels.com/photos/32901646/pexels-photo-32901646.jpeg",
    147: "https://images.pexels.com/photos/30923399/pexels-photo-30923399.jpeg",
    // Company Overview
    148: "https://images.pexels.com/photos/4705928/pexels-photo-4705928.jpeg",
    149: "https://images.pexels.com/photos/313773/pexels-photo-313773.jpeg",
    150: "https://images.pexels.com/photos/37772317/pexels-photo-37772317.jpeg",
    151: "https://images.pexels.com/photos/7193706/pexels-photo-7193706.jpeg",
    152: "https://images.pexels.com/photos/4172382/pexels-photo-4172382.jpeg",
    153: "https://images.pexels.com/photos/14680170/pexels-photo-14680170.jpeg",
    154: "https://images.pexels.com/photos/5974251/pexels-photo-5974251.jpeg",
    155: "https://images.pexels.com/photos/34361571/pexels-photo-34361571.jpeg",
    156: "https://images.pexels.com/photos/7484789/pexels-photo-7484789.jpeg",
    157: "https://images.pexels.com/photos/6790108/pexels-photo-6790108.jpeg",
    158: "https://images.pexels.com/photos/5973906/pexels-photo-5973906.jpeg",
    159: "https://images.pexels.com/photos/4450106/pexels-photo-4450106.jpeg",
    160: "https://images.pexels.com/photos/5711774/pexels-photo-5711774.jpeg",
    161: "https://images.pexels.com/photos/1406367/pexels-photo-1406367.jpeg",
    162: "https://images.pexels.com/photos/18152525/pexels-photo-18152525.jpeg",
    // Go-to-Market Plan
    163: "https://images.pexels.com/photos/38414197/pexels-photo-38414197.jpeg",
    164: "https://images.pexels.com/photos/7289707/pexels-photo-7289707.jpeg",
    165: "https://images.pexels.com/photos/8386651/pexels-photo-8386651.jpeg",
    166: "https://images.pexels.com/photos/4483860/pexels-photo-4483860.jpeg",
    167: "https://images.pexels.com/photos/7018662/pexels-photo-7018662.jpeg",
    168: "https://images.pexels.com/photos/34718922/pexels-photo-34718922.jpeg",
    169: "https://images.pexels.com/photos/8921700/pexels-photo-8921700.jpeg",
    170: "https://images.pexels.com/photos/6169177/pexels-photo-6169177.jpeg",
    171: "https://images.pexels.com/photos/5638732/pexels-photo-5638732.jpeg",
    172: "https://images.pexels.com/photos/14690527/pexels-photo-14690527.jpeg",
    173: "https://images.pexels.com/photos/4618598/pexels-photo-4618598.jpeg",
    // Project Proposal
    174: "https://images.pexels.com/photos/34258683/pexels-photo-34258683.jpeg",
    175: "https://images.pexels.com/photos/28458009/pexels-photo-28458009.jpeg",
    176: "https://images.pexels.com/photos/672997/pexels-photo-672997.jpeg",
    177: "https://images.pexels.com/photos/4787613/pexels-photo-4787613.jpeg",
    178: "https://images.pexels.com/photos/8091464/pexels-photo-8091464.jpeg",
    179: "https://images.pexels.com/photos/35181261/pexels-photo-35181261.jpeg",
    180: "https://images.pexels.com/photos/31723396/pexels-photo-31723396.jpeg",
    181: "https://images.pexels.com/photos/15757545/pexels-photo-15757545.jpeg",
    182: "https://images.pexels.com/photos/4820811/pexels-photo-4820811.jpeg",
    183: "https://images.pexels.com/photos/978319/pexels-photo-978319.jpeg",
    // Investor Update
    184: "https://images.pexels.com/photos/3674371/pexels-photo-3674371.jpeg",
    185: "https://images.pexels.com/photos/133576/pexels-photo-133576.jpeg",
    186: "https://images.pexels.com/photos/957918/ramsauer-ache-ramsau-water-river-957918.jpeg",
    187: "https://images.pexels.com/photos/13057864/pexels-photo-13057864.jpeg",
    // Business Proposal
    188: "https://images.pexels.com/photos/8783541/pexels-photo-8783541.jpeg",
    189: "https://images.pexels.com/photos/31336007/pexels-photo-31336007.jpeg",
    190: "https://images.pexels.com/photos/9799731/pexels-photo-9799731.jpeg",
    191: "https://images.pexels.com/photos/6729427/pexels-photo-6729427.jpeg",
    192: "https://images.pexels.com/photos/32845660/pexels-photo-32845660.jpeg",
    193: "https://images.pexels.com/photos/7648247/pexels-photo-7648247.jpeg",
    194: "https://images.pexels.com/photos/8960946/pexels-photo-8960946.jpeg",
    195: "https://images.pexels.com/photos/9875418/pexels-photo-9875418.jpeg",
    196: "https://images.pexels.com/photos/39120404/pexels-photo-39120404.jpeg",
    // Board Deck
    197: "https://images.pexels.com/photos/17912771/pexels-photo-17912771.jpeg",
    198: "https://images.pexels.com/photos/33207979/pexels-photo-33207979.jpeg",
    199: "https://images.pexels.com/photos/27906817/pexels-photo-27906817.jpeg",
    200: "https://images.pexels.com/photos/1480597/pexels-photo-1480597.jpeg",
    // Sponsorship Proposal
    201: "https://images.pexels.com/photos/28774410/pexels-photo-28774410.jpeg",
    202: "https://images.pexels.com/photos/12657546/pexels-photo-12657546.jpeg",
    203: "https://images.pexels.com/photos/803046/pexels-photo-803046.jpeg",
    204: "https://images.pexels.com/photos/7546601/pexels-photo-7546601.jpeg",
    205: "https://images.pexels.com/photos/36243530/pexels-photo-36243530.jpeg",
    206: "https://images.pexels.com/photos/29775304/pexels-photo-29775304.jpeg",
    207: "https://images.pexels.com/photos/5239525/pexels-photo-5239525.jpeg",
    208: "https://images.pexels.com/photos/13168697/pexels-photo-13168697.jpeg",
    209: "https://images.pexels.com/photos/7528134/pexels-photo-7528134.jpeg",
    210: "https://images.pexels.com/photos/7357310/pexels-photo-7357310.jpeg",
    // Statement of Work
    211: "https://images.pexels.com/photos/1671630/pexels-photo-1671630.jpeg",
    212: "https://images.pexels.com/photos/34429712/pexels-photo-34429712.jpeg",
    213: "https://images.pexels.com/photos/10254876/pexels-photo-10254876.jpeg",
    214: "https://images.pexels.com/photos/5571969/pexels-photo-5571969.jpeg",
    // Annual Report
    215: "https://images.pexels.com/photos/20013170/pexels-photo-20013170.jpeg",
    216: "https://images.pexels.com/photos/39058020/pexels-photo-39058020.jpeg",
    217: "https://images.pexels.com/photos/18306343/pexels-photo-18306343.jpeg",
    218: "https://images.pexels.com/photos/13402800/pexels-photo-13402800.jpeg",
    219: "https://images.pexels.com/photos/32759835/pexels-photo-32759835.jpeg",
    220: "https://images.pexels.com/photos/18332045/pexels-photo-18332045.jpeg",
    221: "https://images.pexels.com/photos/13199323/pexels-photo-13199323.jpeg",
    222: "https://images.pexels.com/photos/7285975/pexels-photo-7285975.jpeg",
    223: "https://images.pexels.com/photos/32901665/pexels-photo-32901665.jpeg",
    // Case Study
    224: "https://images.pexels.com/photos/9102597/pexels-photo-9102597.jpeg",
    225: "https://images.pexels.com/photos/36430088/pexels-photo-36430088.jpeg",
    226: "https://images.pexels.com/photos/5531289/pexels-photo-5531289.jpeg",
    227: "https://images.pexels.com/photos/16636352/pexels-photo-16636352.jpeg",
    228: "https://images.pexels.com/photos/262978/pexels-photo-262978.jpeg",
    229: "https://images.pexels.com/photos/18405036/pexels-photo-18405036.jpeg",
    230: "https://images.pexels.com/photos/36799163/pexels-photo-36799163.jpeg",
    // Research Report
    231: "https://images.pexels.com/photos/29229921/pexels-photo-29229921.jpeg",
    232: "https://images.pexels.com/photos/10544670/pexels-photo-10544670.jpeg",
    233: "https://images.pexels.com/photos/6883797/pexels-photo-6883797.jpeg",
    234: "https://images.pexels.com/photos/38197406/pexels-photo-38197406.jpeg",
    235: "https://images.pexels.com/photos/18136344/pexels-photo-18136344.jpeg",
    236: "https://images.pexels.com/photos/3931441/pexels-photo-3931441.jpeg",
    237: "https://images.pexels.com/photos/9405998/pexels-photo-9405998.jpeg",
    238: "https://images.pexels.com/photos/31376296/pexels-photo-31376296.jpeg",
    // Market Analysis
    239: "https://images.pexels.com/photos/4678065/pexels-photo-4678065.jpeg",
    240: "https://images.pexels.com/photos/9799736/pexels-photo-9799736.jpeg",
    241: "https://images.pexels.com/photos/29653407/pexels-photo-29653407.jpeg",
    242: "https://images.pexels.com/photos/5660747/pexels-photo-5660747.jpeg",
    243: "https://images.pexels.com/photos/4005049/pexels-photo-4005049.jpeg",
    244: "https://images.pexels.com/photos/16586150/pexels-photo-16586150.jpeg",
    245: "https://images.pexels.com/photos/13034408/pexels-photo-13034408.jpeg",
    246: "https://images.pexels.com/photos/9800035/pexels-photo-9800035.jpeg",
    // Quarterly Business Review
    247: "https://images.pexels.com/photos/16827297/pexels-photo-16827297.jpeg",
    248: "https://images.pexels.com/photos/7316998/pexels-photo-7316998.jpeg",
    249: "https://images.pexels.com/photos/7708657/pexels-photo-7708657.jpeg",
    250: "https://images.pexels.com/photos/12182294/pexels-photo-12182294.jpeg",
    251: "https://images.pexels.com/photos/8964568/pexels-photo-8964568.jpeg",
    252: "https://images.pexels.com/photos/12264570/pexels-photo-12264570.jpeg",
    // Industry Trends Report
    253: "https://images.pexels.com/photos/27530475/pexels-photo-27530475.jpeg",
    254: "https://images.pexels.com/photos/18471441/pexels-photo-18471441.jpeg",
    255: "https://images.pexels.com/photos/16544056/pexels-photo-16544056.jpeg",
    256: "https://images.pexels.com/photos/36217325/pexels-photo-36217325.jpeg",
    257: "https://images.pexels.com/photos/12747007/pexels-photo-12747007.jpeg",
    258: "https://images.pexels.com/photos/19750125/pexels-photo-19750125.jpeg",
    // Restaurant Menu
    259: "https://images.pexels.com/photos/36029879/pexels-photo-36029879.jpeg",
    260: "https://images.pexels.com/photos/27101539/pexels-photo-27101539.jpeg",
    261: "https://images.pexels.com/photos/27828493/pexels-photo-27828493.jpeg",
    262: "https://images.pexels.com/photos/35567499/pexels-photo-35567499.jpeg",
    263: "https://images.pexels.com/photos/93796/pexels-photo-93796.jpeg",
    264: "https://images.pexels.com/photos/15971319/pexels-photo-15971319.jpeg",
    // Travel Itinerary
    265: "https://images.pexels.com/photos/12382830/pexels-photo-12382830.jpeg",
    266: "https://images.pexels.com/photos/20955080/pexels-photo-20955080.jpeg",
    267: "https://images.pexels.com/photos/27128374/pexels-photo-27128374.jpeg",
    268: "https://images.pexels.com/photos/20458520/pexels-photo-20458520.jpeg",
    269: "https://images.pexels.com/photos/2236602/pexels-photo-2236602.jpeg",
    270: "https://images.pexels.com/photos/32265085/pexels-photo-32265085.jpeg",
    271: "https://images.pexels.com/photos/35919331/pexels-photo-35919331.jpeg",
    272: "https://images.pexels.com/photos/8904578/pexels-photo-8904578.jpeg",
    273: "https://images.pexels.com/photos/29877239/pexels-photo-29877239.jpeg",
    274: "https://images.pexels.com/photos/31291321/pexels-photo-31291321.jpeg",
    275: "https://images.pexels.com/photos/35901123/pexels-photo-35901123.jpeg",
    276: "https://images.pexels.com/photos/614484/pexels-photo-614484.jpeg",
    277: "https://images.pexels.com/photos/27680481/pexels-photo-27680481.jpeg",
    // Property Listing
    278: "https://images.pexels.com/photos/7046770/pexels-photo-7046770.jpeg",
    279: "https://images.pexels.com/photos/10855258/pexels-photo-10855258.jpeg",
    280: "https://images.pexels.com/photos/2889618/pexels-photo-2889618.jpeg",
    281: "https://images.pexels.com/photos/39163577/pexels-photo-39163577.jpeg",
    282: "https://images.pexels.com/photos/31996198/pexels-photo-31996198.jpeg",
    283: "https://images.pexels.com/photos/10681197/pexels-photo-10681197.jpeg",
    284: "https://images.pexels.com/photos/23957265/pexels-photo-23957265.jpeg",
    285: "https://images.pexels.com/photos/8829198/pexels-photo-8829198.jpeg",
    286: "https://images.pexels.com/photos/35425402/pexels-photo-35425402.jpeg",
    287: "https://images.pexels.com/photos/12909227/pexels-photo-12909227.jpeg",
    // Guest Guide
    288: "https://images.pexels.com/photos/20555138/pexels-photo-20555138.jpeg",
    289: "https://images.pexels.com/photos/32278894/pexels-photo-32278894.jpeg",
    290: "https://images.pexels.com/photos/33338121/pexels-photo-33338121.jpeg",
    291: "https://images.pexels.com/photos/33843099/pexels-photo-33843099.jpeg",
    292: "https://images.pexels.com/photos/30274512/pexels-photo-30274512.jpeg",
    293: "https://images.pexels.com/photos/1796710/pexels-photo-1796710.jpeg",
    294: "https://images.pexels.com/photos/11150214/pexels-photo-11150214.jpeg",
    295: "https://images.pexels.com/photos/30100918/pexels-photo-30100918.jpeg",
    296: "https://images.pexels.com/photos/5505744/pexels-photo-5505744.jpeg",
    297: "https://images.pexels.com/photos/36931077/pexels-photo-36931077.jpeg",
    // Recipe Collection
    298: "https://images.pexels.com/photos/37848848/pexels-photo-37848848.jpeg",
    299: "https://images.pexels.com/photos/6287295/pexels-photo-6287295.jpeg",
    300: "https://images.pexels.com/photos/566564/pexels-photo-566564.jpeg",
    301: "https://images.pexels.com/photos/5645031/pexels-photo-5645031.jpeg",
    302: "https://images.pexels.com/photos/7262983/pexels-photo-7262983.jpeg",
    303: "https://images.pexels.com/photos/35041670/pexels-photo-35041670.jpeg",
    304: "https://images.pexels.com/photos/574125/pexels-photo-574125.jpeg",
    305: "https://images.pexels.com/photos/14146060/pexels-photo-14146060.jpeg",
    306: "https://images.pexels.com/photos/9878732/pexels-photo-9878732.jpeg",
    307: "https://images.pexels.com/photos/4033108/pexels-photo-4033108.jpeg",
    // Event Program
    308: "https://images.pexels.com/photos/22863012/pexels-photo-22863012.jpeg",
    309: "https://images.pexels.com/photos/7715781/pexels-photo-7715781.jpeg",
    310: "https://images.pexels.com/photos/30175901/pexels-photo-30175901.jpeg",
    311: "https://images.pexels.com/photos/9419224/pexels-photo-9419224.jpeg",
    312: "https://images.pexels.com/photos/31644581/pexels-photo-31644581.jpeg",
    313: "https://images.pexels.com/photos/18477124/pexels-photo-18477124.jpeg",
    314: "https://images.pexels.com/photos/30838766/pexels-photo-30838766.jpeg",
    315: "https://images.pexels.com/photos/39004762/pexels-photo-39004762.jpeg",
    316: "https://images.pexels.com/photos/10024790/pexels-photo-10024790.jpeg",
    // Executive Summary
    317: "https://images.pexels.com/photos/27830878/pexels-photo-27830878.jpeg",
    318: "https://images.pexels.com/photos/13971183/pexels-photo-13971183.jpeg",
    319: "https://images.pexels.com/photos/18274597/pexels-photo-18274597.jpeg",
    320: "https://images.pexels.com/photos/6223001/pexels-photo-6223001.jpeg",
    321: "https://images.pexels.com/photos/35096909/pexels-photo-35096909.jpeg",
    322: "https://images.pexels.com/photos/35484457/pexels-photo-35484457.jpeg",
    323: "https://images.pexels.com/photos/3257659/pexels-photo-3257659.jpeg",
    324: "https://images.pexels.com/photos/34937972/pexels-photo-34937972.jpeg",
    // Product One-Pager
    325: "https://images.pexels.com/photos/11053643/pexels-photo-11053643.jpeg",
    326: "https://images.pexels.com/photos/6720532/pexels-photo-6720532.jpeg",
    327: "https://images.pexels.com/photos/27099093/pexels-photo-27099093.jpeg",
    328: "https://images.pexels.com/photos/38189356/pexels-photo-38189356.jpeg",
    329: "https://images.pexels.com/photos/4345863/pexels-photo-4345863.jpeg",
    330: "https://images.pexels.com/photos/10826603/pexels-photo-10826603.jpeg",
    // Company Fact Sheet
    331: "https://images.pexels.com/photos/19740640/pexels-photo-19740640.jpeg",
    332: "https://images.pexels.com/photos/30552490/pexels-photo-30552490.jpeg",
    333: "https://images.pexels.com/photos/15559302/pexels-photo-15559302.jpeg",
    334: "https://images.pexels.com/photos/19311440/pexels-photo-19311440.jpeg",
    335: "https://images.pexels.com/photos/6699404/pexels-photo-6699404.jpeg",
    336: "https://images.pexels.com/photos/5991595/pexels-photo-5991595.jpeg",
    337: "https://images.pexels.com/photos/32050401/pexels-photo-32050401.jpeg",
    338: "https://images.pexels.com/photos/14254070/pexels-photo-14254070.jpeg",
    339: "https://images.pexels.com/photos/4763440/pexels-photo-4763440.jpeg",
    340: "https://images.pexels.com/photos/11621064/pexels-photo-11621064.jpeg",
    // Partnership Proposal
    341: "https://images.pexels.com/photos/7192878/pexels-photo-7192878.jpeg",
    342: "https://images.pexels.com/photos/10755242/pexels-photo-10755242.jpeg",
    343: "https://images.pexels.com/photos/7510489/pexels-photo-7510489.jpeg",
    344: "https://images.pexels.com/photos/13272708/pexels-photo-13272708.jpeg",
    345: "https://images.pexels.com/photos/20052577/pexels-photo-20052577.jpeg",
    // About Page
    346: "https://images.pexels.com/photos/8093846/pexels-photo-8093846.jpeg",
    347: "https://images.pexels.com/photos/8093908/pexels-photo-8093908.jpeg",
    348: "https://images.pexels.com/photos/16849843/pexels-photo-16849843.jpeg",
    349: "https://images.pexels.com/photos/6050331/pexels-photo-6050331.jpeg",
    350: "https://images.pexels.com/photos/14498783/pexels-photo-14498783.jpeg",
    351: "https://images.pexels.com/photos/39268200/pexels-photo-39268200.jpeg",
    352: "https://images.pexels.com/photos/2977515/pexels-photo-2977515.jpeg",
    353: "https://images.pexels.com/photos/10389450/pexels-photo-10389450.jpeg",
    354: "https://images.pexels.com/photos/2035416/pexels-photo-2035416.jpeg",
    355: "https://images.pexels.com/photos/26988194/pexels-photo-26988194.jpeg",
    // Demo Booking Page
    356: "https://images.pexels.com/photos/6959221/pexels-photo-6959221.jpeg",
    357: "https://images.pexels.com/photos/71184/pexels-photo-71184.jpeg",
    358: "https://images.pexels.com/photos/8371705/pexels-photo-8371705.jpeg",
    359: "https://images.pexels.com/photos/35569763/pexels-photo-35569763.jpeg",
    360: "https://images.pexels.com/photos/9152297/pexels-photo-9152297.jpeg",
    // Wall of Love
    361: "https://images.pexels.com/photos/4391469/pexels-photo-4391469.jpeg",
    362: "https://images.pexels.com/photos/6044805/pexels-photo-6044805.jpeg",
    363: "https://images.pexels.com/photos/37677476/pexels-photo-37677476.jpeg",
    364: "https://images.pexels.com/photos/8456426/pexels-photo-8456426.jpeg",
    365: "https://images.pexels.com/photos/2918/lights-lamps-design-recycling.jpg",
    // Solution Page
    366: "https://images.pexels.com/photos/34902065/pexels-photo-34902065.jpeg",
    367: "https://images.pexels.com/photos/6720519/pexels-photo-6720519.jpeg",
    368: "https://images.pexels.com/photos/12418935/pexels-photo-12418935.jpeg",
    369: "https://images.pexels.com/photos/17720190/pexels-photo-17720190.png",
    370: "https://images.pexels.com/photos/5762756/pexels-photo-5762756.jpeg",
    371: "https://images.pexels.com/photos/28231879/pexels-photo-28231879.jpeg",
    // Comparison Page
    372: "https://images.pexels.com/photos/6942673/pexels-photo-6942673.jpeg",
    373: "https://images.pexels.com/photos/7054757/pexels-photo-7054757.jpeg",
    374: "https://images.pexels.com/photos/8533487/pexels-photo-8533487.jpeg",
    375: "https://images.pexels.com/photos/10346461/pexels-photo-10346461.jpeg",
    376: "https://images.pexels.com/photos/5357431/pexels-photo-5357431.jpeg",
    377: "https://images.pexels.com/photos/31107325/pexels-photo-31107325.jpeg",
    378: "https://images.pexels.com/photos/6026154/pexels-photo-6026154.jpeg",
    // Campaign Pitch
    379: "https://images.pexels.com/photos/6933080/pexels-photo-6933080.jpeg",
    380: "https://images.pexels.com/photos/6619046/pexels-photo-6619046.jpeg",
    381: "https://images.pexels.com/photos/1118800/pexels-photo-1118800.jpeg",
    382: "https://images.pexels.com/photos/2777594/pexels-photo-2777594.jpeg",
    383: "https://images.pexels.com/photos/1210043/pexels-photo-1210043.jpeg",
    384: "https://images.pexels.com/photos/8357239/pexels-photo-8357239.jpeg",
    385: "https://images.pexels.com/photos/32138542/pexels-photo-32138542.jpeg",
    386: "https://images.pexels.com/photos/7878196/pexels-photo-7878196.jpeg",
    387: "https://images.pexels.com/photos/12604249/pexels-photo-12604249.jpeg",
    // Brand Guidelines
    388: "https://images.pexels.com/photos/10215906/pexels-photo-10215906.jpeg",
    389: "https://images.pexels.com/photos/37539911/pexels-photo-37539911.jpeg",
    390: "https://images.pexels.com/photos/4140925/pexels-photo-4140925.jpeg",
    391: "https://images.pexels.com/photos/30444143/pexels-photo-30444143.jpeg",
    392: "https://images.pexels.com/photos/4353571/pexels-photo-4353571.jpeg",
    393: "https://images.pexels.com/photos/18059555/pexels-photo-18059555.jpeg",
    394: "https://images.pexels.com/photos/30925472/pexels-photo-30925472.jpeg",
    395: "https://images.pexels.com/photos/38675233/pexels-photo-38675233.jpeg",
    396: "https://images.pexels.com/photos/28720636/pexels-photo-28720636.jpeg",
    // Announcement Keynote
    397: "https://images.pexels.com/photos/34514431/pexels-photo-34514431.jpeg",
    398: "https://images.pexels.com/photos/2382941/pexels-photo-2382941.jpeg",
    399: "https://images.pexels.com/photos/16682740/pexels-photo-16682740.jpeg",
    400: "https://images.pexels.com/photos/20605710/pexels-photo-20605710.jpeg",
    401: "https://images.pexels.com/photos/35522712/pexels-photo-35522712.jpeg",
    402: "https://images.pexels.com/photos/17877136/pexels-photo-17877136.jpeg",
    403: "https://images.pexels.com/photos/10207902/pexels-photo-10207902.jpeg",
    // Launch Briefing
    404: "https://images.pexels.com/photos/15801259/pexels-photo-15801259.jpeg",
    405: "https://images.pexels.com/photos/4487383/pexels-photo-4487383.jpeg",
    406: "https://images.pexels.com/photos/1576655/pexels-photo-1576655.jpeg",
    407: "https://images.pexels.com/photos/7019315/pexels-photo-7019315.jpeg",
    408: "https://images.pexels.com/photos/37306360/pexels-photo-37306360.jpeg",
    409: "https://images.pexels.com/photos/27741479/pexels-photo-27741479.jpeg",
    // Release Notes
    410: "https://images.pexels.com/photos/19844983/pexels-photo-19844983.jpeg",
    411: "https://images.pexels.com/photos/32846085/pexels-photo-32846085.jpeg",
    412: "https://images.pexels.com/photos/5379735/pexels-photo-5379735.jpeg",
    413: "https://images.pexels.com/photos/32313637/pexels-photo-32313637.jpeg",
    414: "https://images.pexels.com/photos/8730963/pexels-photo-8730963.jpeg",
    415: "https://images.pexels.com/photos/33119680/pexels-photo-33119680.jpeg",
    416: "https://images.pexels.com/photos/14145081/pexels-photo-14145081.jpeg",
    // Press Kit
    417: "https://images.pexels.com/photos/6910805/pexels-photo-6910805.jpeg",
    418: "https://images.pexels.com/photos/36935416/pexels-photo-36935416.jpeg",
    419: "https://images.pexels.com/photos/36169774/pexels-photo-36169774.jpeg",
    420: "https://images.pexels.com/photos/2286953/pexels-photo-2286953.jpeg",
    421: "https://images.pexels.com/photos/29249340/pexels-photo-29249340.jpeg",
    422: "https://images.pexels.com/photos/35671577/pexels-photo-35671577.jpeg",
    423: "https://images.pexels.com/photos/6221592/pexels-photo-6221592.jpeg",
    // Launch Playbook
    424: "https://images.pexels.com/photos/13451362/pexels-photo-13451362.jpeg",
    425: "https://images.pexels.com/photos/36040444/pexels-photo-36040444.jpeg",
    426: "https://images.pexels.com/photos/22743642/pexels-photo-22743642.jpeg",
    427: "https://images.pexels.com/photos/7433833/pexels-photo-7433833.jpeg",
    428: "https://images.pexels.com/photos/7590891/pexels-photo-7590891.jpeg",
    429: "https://images.pexels.com/photos/9807534/pexels-photo-9807534.jpeg",
    430: "https://images.pexels.com/photos/97065/pexels-photo-97065.jpeg",
    // Messaging Guide
    431: "https://images.pexels.com/photos/27457817/pexels-photo-27457817.jpeg",
    432: "https://images.pexels.com/photos/7018645/pexels-photo-7018645.jpeg",
    433: "https://images.pexels.com/photos/15884387/pexels-photo-15884387.jpeg",
    434: "https://images.pexels.com/photos/37082290/pexels-photo-37082290.jpeg",
    435: "https://images.pexels.com/photos/34207364/pexels-photo-34207364.jpeg",
    // Pricing Page
    436: "https://images.pexels.com/photos/38929851/pexels-photo-38929851.jpeg",
    437: "https://images.pexels.com/photos/4350068/pexels-photo-4350068.jpeg",
    438: "https://images.pexels.com/photos/18999171/pexels-photo-18999171.jpeg",
    439: "https://images.pexels.com/photos/33350398/pexels-photo-33350398.jpeg",
    440: "https://images.pexels.com/photos/7433847/pexels-photo-7433847.jpeg",
    441: "https://images.pexels.com/photos/5414405/pexels-photo-5414405.jpeg",
    // Kickoff Deck
    442: "https://images.pexels.com/photos/36836423/pexels-photo-36836423.jpeg",
    443: "https://images.pexels.com/photos/36316814/pexels-photo-36316814.jpeg",
    444: "https://images.pexels.com/photos/37815287/pexels-photo-37815287.jpeg",
    445: "https://images.pexels.com/photos/35631346/pexels-photo-35631346.jpeg",
    446: "https://images.pexels.com/photos/9880528/pexels-photo-9880528.jpeg",
    // Capabilities Deck
    447: "https://images.pexels.com/photos/30618178/pexels-photo-30618178.jpeg",
    448: "https://images.pexels.com/photos/9850083/pexels-photo-9850083.jpeg",
    449: "https://images.pexels.com/photos/34916291/pexels-photo-34916291.jpeg",
    450: "https://images.pexels.com/photos/6621012/pexels-photo-6621012.jpeg",
    451: "https://images.pexels.com/photos/5090641/pexels-photo-5090641.jpeg",
    452: "https://images.pexels.com/photos/1068323/pexels-photo-1068323.jpeg",
    453: "https://images.pexels.com/photos/4153156/pexels-photo-4153156.jpeg",
    454: "https://images.pexels.com/photos/18328707/pexels-photo-18328707.jpeg",
    455: "https://images.pexels.com/photos/28101598/pexels-photo-28101598.jpeg",
    456: "https://images.pexels.com/photos/28101637/pexels-photo-28101637.jpeg",
    457: "https://images.pexels.com/photos/8678659/pexels-photo-8678659.jpeg",
    458: "https://images.pexels.com/photos/1529034/pexels-photo-1529034.jpeg",
    459: "https://images.pexels.com/photos/14458376/pexels-photo-14458376.jpeg",
    // Workshop Deck
    460: "https://images.pexels.com/photos/4820683/pexels-photo-4820683.jpeg",
    461: "https://images.pexels.com/photos/4347484/pexels-photo-4347484.jpeg",
    462: "https://images.pexels.com/photos/3807741/pexels-photo-3807741.jpeg",
    463: "https://images.pexels.com/photos/37539928/pexels-photo-37539928.jpeg",
    464: "https://images.pexels.com/photos/9572404/pexels-photo-9572404.jpeg",
    465: "https://images.pexels.com/photos/9962719/pexels-photo-9962719.jpeg",
    466: "https://images.pexels.com/photos/14679166/pexels-photo-14679166.jpeg",
    467: "https://images.pexels.com/photos/16682441/pexels-photo-16682441.jpeg",
    // Client Status Update
    468: "https://images.pexels.com/photos/5845892/pexels-photo-5845892.jpeg",
    469: "https://images.pexels.com/photos/5963131/pexels-photo-5963131.jpeg",
    470: "https://images.pexels.com/photos/5531409/pexels-photo-5531409.jpeg",
    471: "https://images.pexels.com/photos/7203849/pexels-photo-7203849.jpeg",
    472: "https://images.pexels.com/photos/6790748/pexels-photo-6790748.jpeg",
    473: "https://images.pexels.com/photos/8551121/pexels-photo-8551121.jpeg",
    // Proposal Site
    474: "https://images.pexels.com/photos/4820783/pexels-photo-4820783.jpeg",
    475: "https://images.pexels.com/photos/32258174/pexels-photo-32258174.jpeg",
    476: "https://images.pexels.com/photos/37539930/pexels-photo-37539930.jpeg",
    477: "https://images.pexels.com/photos/36407802/pexels-photo-36407802.jpeg",
    478: "https://images.pexels.com/photos/36247921/pexels-photo-36247921.jpeg",
    479: "https://images.pexels.com/photos/19193225/pexels-photo-19193225.jpeg",
    480: "https://images.pexels.com/photos/33469928/pexels-photo-33469928.jpeg",
    481: "https://images.pexels.com/photos/13278839/pexels-photo-13278839.jpeg",
    482: "https://images.pexels.com/photos/17309031/pexels-photo-17309031.jpeg",
    483: "https://images.pexels.com/photos/29472840/pexels-photo-29472840.jpeg",
    484: "https://images.pexels.com/photos/1212793/pexels-photo-1212793.jpeg",
    485: "https://images.pexels.com/photos/16556498/pexels-photo-16556498.jpeg",
    // Project Hub
    486: "https://images.pexels.com/photos/10178910/pexels-photo-10178910.jpeg",
    487: "https://images.pexels.com/photos/4992651/pexels-photo-4992651.jpeg",
    488: "https://images.pexels.com/photos/595910/pexels-photo-595910.jpeg",
    489: "https://images.pexels.com/photos/7203976/pexels-photo-7203976.jpeg",
    490: "https://images.pexels.com/photos/11315991/pexels-photo-11315991.jpeg",
    491: "https://images.pexels.com/photos/8337527/pexels-photo-8337527.jpeg",
    // Case Study Site
    492: "https://images.pexels.com/photos/11923047/pexels-photo-11923047.jpeg",
    493: "https://images.pexels.com/photos/12203611/pexels-photo-12203611.jpeg",
    494: "https://images.pexels.com/photos/1095124/pexels-photo-1095124.jpeg",
    495: "https://images.pexels.com/photos/36242476/pexels-photo-36242476.jpeg",
    496: "https://images.pexels.com/photos/32568165/pexels-photo-32568165.jpeg",
    497: "https://images.pexels.com/photos/36878588/pexels-photo-36878588.jpeg",
    498: "https://images.pexels.com/photos/25809277/pexels-photo-25809277.jpeg",
    499: "https://images.pexels.com/photos/128875/table-covered-glass-cutlery-128875.jpeg",
    // Services Page
    500: "https://images.pexels.com/photos/36353420/pexels-photo-36353420.png",
    501: "https://images.pexels.com/photos/38755602/pexels-photo-38755602.jpeg",
    502: "https://images.pexels.com/photos/31659327/pexels-photo-31659327.jpeg",
    503: "https://images.pexels.com/photos/37591021/pexels-photo-37591021.jpeg",
    504: "https://images.pexels.com/photos/11911863/pexels-photo-11911863.jpeg",
    505: "https://images.pexels.com/photos/3284980/pexels-photo-3284980.png",
    506: "https://images.pexels.com/photos/30158441/pexels-photo-30158441.jpeg",
    // All-Hands Deck
    507: "https://images.pexels.com/photos/27608329/pexels-photo-27608329.jpeg",
    508: "https://images.pexels.com/photos/12909044/pexels-photo-12909044.jpeg",
    509: "https://images.pexels.com/photos/37305116/pexels-photo-37305116.jpeg",
    510: "https://images.pexels.com/photos/23319066/pexels-photo-23319066.jpeg",
    511: "https://images.pexels.com/photos/10878673/pexels-photo-10878673.jpeg",
    512: "https://images.pexels.com/photos/887270/pexels-photo-887270.jpeg",
    // Growth Review
    513: "https://images.pexels.com/photos/12563461/pexels-photo-12563461.jpeg",
    514: "https://images.pexels.com/photos/7857503/pexels-photo-7857503.jpeg",
    515: "https://images.pexels.com/photos/37184190/pexels-photo-37184190.jpeg",
    516: "https://images.pexels.com/photos/33582/sunrise-phu-quoc-island-ocean.jpg",
    517: "https://images.pexels.com/photos/34743825/pexels-photo-34743825.jpeg",
    // Research Readout
    518: "https://images.pexels.com/photos/7991493/pexels-photo-7991493.jpeg",
    519: "https://images.pexels.com/photos/16585156/pexels-photo-16585156.jpeg",
    520: "https://images.pexels.com/photos/5990039/pexels-photo-5990039.jpeg",
    521: "https://images.pexels.com/photos/8382613/pexels-photo-8382613.jpeg",
    522: "https://images.pexels.com/photos/15569230/pexels-photo-15569230.jpeg",
    523: "https://images.pexels.com/photos/33196899/pexels-photo-33196899.jpeg",
    // Annual Plan
    524: "https://images.pexels.com/photos/16586151/pexels-photo-16586151.jpeg",
    525: "https://images.pexels.com/photos/6961110/pexels-photo-6961110.jpeg",
    526: "https://images.pexels.com/photos/9875676/pexels-photo-9875676.jpeg",
    527: "https://images.pexels.com/photos/8961701/pexels-photo-8961701.jpeg",
    528: "https://images.pexels.com/photos/38555493/pexels-photo-38555493.png",
    529: "https://images.pexels.com/photos/36848361/pexels-photo-36848361.jpeg",
    // Impact Report Site
    530: "https://images.pexels.com/photos/9875685/pexels-photo-9875685.jpeg",
    531: "https://images.pexels.com/photos/4254166/pexels-photo-4254166.jpeg",
    532: "https://images.pexels.com/photos/5724030/pexels-photo-5724030.jpeg",
    533: "https://images.pexels.com/photos/7339349/pexels-photo-7339349.jpeg",
    534: "https://images.pexels.com/photos/6961122/pexels-photo-6961122.jpeg",
    535: "https://images.pexels.com/photos/3829454/pexels-photo-3829454.jpeg",
    536: "https://images.pexels.com/photos/12936108/pexels-photo-12936108.jpeg",
    537: "https://images.pexels.com/photos/18306342/pexels-photo-18306342.jpeg",
    // Research Report Site
    538: "https://images.pexels.com/photos/32967976/pexels-photo-32967976.jpeg",
    539: "https://images.pexels.com/photos/12384897/pexels-photo-12384897.jpeg",
    540: "https://images.pexels.com/photos/29625510/pexels-photo-29625510.jpeg",
    541: "https://images.pexels.com/photos/9050619/pexels-photo-9050619.jpeg",
    542: "https://images.pexels.com/photos/9572635/pexels-photo-9572635.jpeg",
    543: "https://images.pexels.com/photos/115294/pexels-photo-115294.jpeg",
    544: "https://images.pexels.com/photos/7707287/pexels-photo-7707287.jpeg",
    545: "https://images.pexels.com/photos/16512513/pexels-photo-16512513.jpeg",
    // Changelog Site
    546: "https://images.pexels.com/photos/216589/pexels-photo-216589.jpeg",
    547: "https://images.pexels.com/photos/18386434/pexels-photo-18386434.jpeg",
    548: "https://images.pexels.com/photos/6991349/pexels-photo-6991349.jpeg",
    549: "https://images.pexels.com/photos/8035282/pexels-photo-8035282.jpeg",
    550: "https://images.pexels.com/photos/36252681/pexels-photo-36252681.jpeg",
    // Open Metrics Page
    551: "https://images.pexels.com/photos/9958947/pexels-photo-9958947.jpeg",
    552: "https://images.pexels.com/photos/14285574/pexels-photo-14285574.jpeg",
    553: "https://images.pexels.com/photos/14776969/pexels-photo-14776969.jpeg",
    554: "https://images.pexels.com/photos/2149904/pexels-photo-2149904.jpeg",
    555: "https://images.pexels.com/photos/8594371/pexels-photo-8594371.jpeg",
    // Status Page
    556: "https://images.pexels.com/photos/37730212/pexels-photo-37730212.jpeg",
    557: "https://images.pexels.com/photos/3202238/pexels-photo-3202238.jpeg",
    558: "https://images.pexels.com/photos/845254/pexels-photo-845254.jpeg",
    // Conference Talk
    559: "https://images.pexels.com/photos/35411369/pexels-photo-35411369.jpeg",
    560: "https://images.pexels.com/photos/1462226/pexels-photo-1462226.jpeg",
    561: "https://images.pexels.com/photos/7115510/pexels-photo-7115510.jpeg",
    562: "https://images.pexels.com/photos/33743787/pexels-photo-33743787.jpeg",
    563: "https://images.pexels.com/photos/38014878/pexels-photo-38014878.jpeg",
    564: "https://images.pexels.com/photos/8327872/pexels-photo-8327872.jpeg",
    565: "https://images.pexels.com/photos/28824299/pexels-photo-28824299.jpeg",
    566: "https://images.pexels.com/photos/20281787/pexels-photo-20281787.jpeg",
    // Portfolio Deck
    567: "https://images.pexels.com/photos/6136314/pexels-photo-6136314.jpeg",
    568: "https://images.pexels.com/photos/11229760/pexels-photo-11229760.jpeg",
    569: "https://images.pexels.com/photos/8475172/pexels-photo-8475172.jpeg",
    570: "https://images.pexels.com/photos/29611199/pexels-photo-29611199.jpeg",
    571: "https://images.pexels.com/photos/6275937/pexels-photo-6275937.jpeg",
    572: "https://images.pexels.com/photos/14499187/pexels-photo-14499187.jpeg",
    573: "https://images.pexels.com/photos/33837946/pexels-photo-33837946.jpeg",
    // Workshop Deck
    574: "https://images.pexels.com/photos/38673756/pexels-photo-38673756.jpeg",
    575: "https://images.pexels.com/photos/14279706/pexels-photo-14279706.jpeg",
    576: "https://images.pexels.com/photos/8510617/pexels-photo-8510617.jpeg",
    577: "https://images.pexels.com/photos/6310453/pexels-photo-6310453.jpeg",
    578: "https://images.pexels.com/photos/10738764/pexels-photo-10738764.jpeg",
    // Year in Review
    579: "https://images.pexels.com/photos/1110661/pexels-photo-1110661.jpeg",
    580: "https://images.pexels.com/photos/11361935/pexels-photo-11361935.jpeg",
    581: "https://images.pexels.com/photos/15875334/pexels-photo-15875334.jpeg",
    582: "https://images.pexels.com/photos/10288924/pexels-photo-10288924.jpeg",
    583: "https://images.pexels.com/photos/24989112/pexels-photo-24989112.jpeg",
    584: "https://images.pexels.com/photos/14288862/pexels-photo-14288862.jpeg",
    585: "https://images.pexels.com/photos/1642295/pexels-photo-1642295.jpeg",
    586: "https://images.pexels.com/photos/32846096/pexels-photo-32846096.jpeg",
    587: "https://images.pexels.com/photos/4460478/pexels-photo-4460478.jpeg",
    // Side Project Pitch
    588: "https://images.pexels.com/photos/1117153/pexels-photo-1117153.jpeg",
    589: "https://images.pexels.com/photos/16372970/pexels-photo-16372970.jpeg",
    590: "https://images.pexels.com/photos/13288524/pexels-photo-13288524.jpeg",
    591: "https://images.pexels.com/photos/27817983/pexels-photo-27817983.jpeg",
    592: "https://images.pexels.com/photos/2898315/pexels-photo-2898315.jpeg",
    // Design Case Study
    593: "https://images.pexels.com/photos/14866182/pexels-photo-14866182.jpeg",
    594: "https://images.pexels.com/photos/401213/pexels-photo-401213.jpeg",
    595: "https://images.pexels.com/photos/23531657/pexels-photo-23531657.jpeg",
    596: "https://images.pexels.com/photos/4140919/pexels-photo-4140919.jpeg",
    597: "https://images.pexels.com/photos/38371841/pexels-photo-38371841.jpeg",
    598: "https://images.pexels.com/photos/12379712/pexels-photo-12379712.jpeg",
    599: "https://images.pexels.com/photos/35291748/pexels-photo-35291748.jpeg",
    // Speaker Kit
    600: "https://images.pexels.com/photos/14654918/pexels-photo-14654918.jpeg",
    601: "https://images.pexels.com/photos/37063496/pexels-photo-37063496.jpeg",
    602: "https://images.pexels.com/photos/19966343/pexels-photo-19966343.jpeg",
    603: "https://images.pexels.com/photos/38490369/pexels-photo-38490369.jpeg",
    604: "https://images.pexels.com/photos/9275222/pexels-photo-9275222.jpeg",
    605: "https://images.pexels.com/photos/35657609/pexels-photo-35657609.jpeg",
    606: "https://images.pexels.com/photos/13356851/pexels-photo-13356851.jpeg",
    607: "https://images.pexels.com/photos/34698781/pexels-photo-34698781.jpeg",
    // Link Hub
    608: "https://images.pexels.com/photos/5191373/pexels-photo-5191373.jpeg",
    609: "https://images.pexels.com/photos/15361907/pexels-photo-15361907.jpeg",
    610: "https://images.pexels.com/photos/36824934/pexels-photo-36824934.jpeg",
    611: "https://images.pexels.com/photos/9964128/pexels-photo-9964128.png",
    // Speaking Page
    612: "https://images.pexels.com/photos/32285897/pexels-photo-32285897.jpeg",
    613: "https://images.pexels.com/photos/7991436/pexels-photo-7991436.jpeg",
    614: "https://images.pexels.com/photos/29636314/pexels-photo-29636314.jpeg",
    615: "https://images.pexels.com/photos/8035286/pexels-photo-8035286.jpeg",
    616: "https://images.pexels.com/photos/5204283/pexels-photo-5204283.jpeg",
    // App Site
    617: "https://images.pexels.com/photos/877971/pexels-photo-877971.jpeg",
    618: "https://images.pexels.com/photos/2228561/pexels-photo-2228561.jpeg",
    619: "https://images.pexels.com/photos/32875258/pexels-photo-32875258.jpeg",
    620: "https://images.pexels.com/photos/28238205/pexels-photo-28238205.jpeg",
    621: "https://images.pexels.com/photos/10677842/pexels-photo-10677842.jpeg",
    622: "https://images.pexels.com/photos/51343/old-letters-old-letter-handwriting-51343.jpeg",
    // Celebration Slideshow
    623: "https://images.pexels.com/photos/15322634/pexels-photo-15322634.jpeg",
    624: "https://images.pexels.com/photos/13115111/pexels-photo-13115111.jpeg",
    625: "https://images.pexels.com/photos/2499601/pexels-photo-2499601.jpeg",
    626: "https://images.pexels.com/photos/27176134/pexels-photo-27176134.jpeg",
    627: "https://images.pexels.com/photos/5638699/pexels-photo-5638699.jpeg",
    628: "https://images.pexels.com/photos/15175666/pexels-photo-15175666.jpeg",
    629: "https://images.pexels.com/photos/19101571/pexels-photo-19101571.jpeg",
    630: "https://images.pexels.com/photos/33175695/pexels-photo-33175695.jpeg",
    631: "https://images.pexels.com/photos/12174173/pexels-photo-12174173.jpeg",
    632: "https://images.pexels.com/photos/14154985/pexels-photo-14154985.jpeg",
    // Trivia Night
    633: "https://images.pexels.com/photos/5491037/pexels-photo-5491037.jpeg",
    634: "https://images.pexels.com/photos/12039010/pexels-photo-12039010.jpeg",
    635: "https://images.pexels.com/photos/5054648/pexels-photo-5054648.jpeg",
    636: "https://images.pexels.com/photos/36516123/pexels-photo-36516123.jpeg",
    637: "https://images.pexels.com/photos/30481262/pexels-photo-30481262.jpeg",
    // Travel Recap
    638: "https://images.pexels.com/photos/9606918/pexels-photo-9606918.jpeg",
    639: "https://images.pexels.com/photos/34585978/pexels-photo-34585978.jpeg",
    640: "https://images.pexels.com/photos/8707896/pexels-photo-8707896.jpeg",
    641: "https://images.pexels.com/photos/37843544/pexels-photo-37843544.jpeg",
    642: "https://images.pexels.com/photos/37066099/pexels-photo-37066099.jpeg",
    643: "https://images.pexels.com/photos/2569817/pexels-photo-2569817.jpeg",
    644: "https://images.pexels.com/photos/34640062/pexels-photo-34640062.jpeg",
    645: "https://images.pexels.com/photos/36800260/pexels-photo-36800260.jpeg",
    646: "https://images.pexels.com/photos/16380649/pexels-photo-16380649.jpeg",
    // Birthday Toast
    647: "https://images.pexels.com/photos/1341883/pexels-photo-1341883.jpeg",
    648: "https://images.pexels.com/photos/36129615/pexels-photo-36129615.jpeg",
    649: "https://images.pexels.com/photos/11368700/pexels-photo-11368700.jpeg",
    650: "https://images.pexels.com/photos/5637766/pexels-photo-5637766.jpeg",
    651: "https://images.pexels.com/photos/8673500/pexels-photo-8673500.jpeg",
    652: "https://images.pexels.com/photos/8260489/pexels-photo-8260489.jpeg",
    653: "https://images.pexels.com/photos/8124248/pexels-photo-8124248.jpeg",
    654: "https://images.pexels.com/photos/25956380/pexels-photo-25956380.jpeg",
    655: "https://images.pexels.com/photos/30146471/pexels-photo-30146471.jpeg",
    // Book Club Season
    656: "https://images.pexels.com/photos/7167831/pexels-photo-7167831.jpeg",
    657: "https://images.pexels.com/photos/34047398/pexels-photo-34047398.jpeg",
    658: "https://images.pexels.com/photos/38075228/pexels-photo-38075228.jpeg",
    659: "https://images.pexels.com/photos/7879388/pexels-photo-7879388.jpeg",
    660: "https://images.pexels.com/photos/176103/pexels-photo-176103.jpeg",
    // Party Invite
    661: "https://images.pexels.com/photos/5638813/pexels-photo-5638813.jpeg",
    662: "https://images.pexels.com/photos/3937880/pexels-photo-3937880.jpeg",
    663: "https://images.pexels.com/photos/5864479/pexels-photo-5864479.jpeg",
    664: "https://images.pexels.com/photos/19685213/pexels-photo-19685213.jpeg",
    665: "https://images.pexels.com/photos/288478/pexels-photo-288478.jpeg",
    666: "https://images.pexels.com/photos/13567862/pexels-photo-13567862.jpeg",
    667: "https://images.pexels.com/photos/14757517/pexels-photo-14757517.jpeg",
    668: "https://images.pexels.com/photos/15075570/pexels-photo-15075570.jpeg",
    // Reunion Site
    669: "https://images.pexels.com/photos/12623944/pexels-photo-12623944.jpeg",
    670: "https://images.pexels.com/photos/6232552/pexels-photo-6232552.jpeg",
    671: "https://images.pexels.com/photos/5263266/pexels-photo-5263266.jpeg",
    672: "https://images.pexels.com/photos/35822109/pexels-photo-35822109.jpeg",
    673: "https://images.pexels.com/photos/21175874/pexels-photo-21175874.jpeg",
    674: "https://images.pexels.com/photos/4716814/pexels-photo-4716814.jpeg",
    // Restaurant Site
    675: "https://images.pexels.com/photos/28059309/pexels-photo-28059309.jpeg",
    676: "https://images.pexels.com/photos/17001771/pexels-photo-17001771.jpeg",
    677: "https://images.pexels.com/photos/6871940/pexels-photo-6871940.jpeg",
    678: "https://images.pexels.com/photos/5779787/pexels-photo-5779787.jpeg",
    679: "https://images.pexels.com/photos/30658142/pexels-photo-30658142.jpeg",
    680: "https://images.pexels.com/photos/34279639/pexels-photo-34279639.jpeg",
    // Rental Listing Site
    681: "https://images.pexels.com/photos/34221319/pexels-photo-34221319.jpeg",
    682: "https://images.pexels.com/photos/37125162/pexels-photo-37125162.jpeg",
    683: "https://images.pexels.com/photos/5506135/pexels-photo-5506135.jpeg",
    684: "https://images.pexels.com/photos/16722408/pexels-photo-16722408.jpeg",
    685: "https://images.pexels.com/photos/38929393/pexels-photo-38929393.jpeg",
    686: "https://images.pexels.com/photos/36498469/pexels-photo-36498469.jpeg",
    687: "https://images.pexels.com/photos/32953037/pexels-photo-32953037.jpeg",
    688: "https://images.pexels.com/photos/18999116/pexels-photo-18999116.jpeg",
};
const pic = (id: number, w = 1100, h = 900): string => {
    const base = PHOTOS[id];
    return base ? `${base}?auto=compress&cs=tinysrgb&fit=crop&w=${w}&h=${h}` : "";
};

const DEMO_VIDEO = "https://www.youtube.com/watch?v=WhWc3b3KhnY";

export const resume: ArtifactContent = doc(
    "studio",
    [
        section(
            "r1",
            split(
                60,
                group(
                    t("PRODUCT DESIGNER", "label"),
                    t("Elena Maris Vance", "h1"),
                    t(
                        "Senior product designer shaping calm, durable software for teams that move fast.",
                        "subtitle",
                    ),
                    t(
                        "San Francisco, CA · elena@vance.design · vance.design · in/elenavance",
                        "caption",
                    ),
                ),
                img(pic(1), 0.82, 200),
            ),
            { background: bgImage(pic(2, 1700, 1100), 0.55) },
        ),
        section(
            "r2",
            group(
                t("Summary", "label"),
                t(
                    "I design end-to-end product experiences, from the first scrappy prototype to the pixels that ship, for tools people open every day. Nine years across fintech, developer platforms, and consumer health, most recently leading design for a payments product used by 40,000+ small businesses. I care about systems that scale, interfaces that disappear, and shipping work that actually makes it to production.",
                    "subtitle",
                ),
            ),
        ),
        section(
            "r3",
            row(
                stat("9 yrs", "designing shipping product"),
                stat("40k+", "businesses on my last product"),
                stat("$12M", "ARR influenced by 2024 redesign"),
            ),
        ),
        section(
            "r4",
            split(
                40,
                group(
                    t("Northwind", "h3"),
                    t("Lead Product Designer", "caption"),
                    t("2022–Present · San Francisco", "caption"),
                ),
                bullets(
                    "Led the end-to-end redesign of the merchant payments dashboard, lifting weekly active use 34% and cutting time-to-first-invoice from 11 minutes to under 3.",
                    "Built and now maintain Aster, the company's first cross-platform design system: 80+ components adopted by four product teams.",
                    "Mentor two designers and run the weekly critique that the whole product org now attends.",
                ),
            ),
        ),
        section(
            "r5",
            split(
                40,
                group(
                    t("Cadence Health", "h3"),
                    t("Senior Product Designer", "caption"),
                    t("2019–2022 · Remote", "caption"),
                ),
                bullets(
                    "Designed the onboarding and daily-tracking flows for a chronic-care app that grew from 5k to 220k monthly users.",
                    "Ran a 6-week research sprint with 40 patients that reframed the entire care-plan model the team had been building.",
                    "Shipped an accessibility overhaul that took the app from WCAG A to AA across every core flow.",
                ),
            ),
        ),
        section(
            "r6",
            split(
                40,
                group(
                    t("Foglight Studio", "h3"),
                    t("Product Designer", "caption"),
                    t("2017–2019 · Portland", "caption"),
                ),
                bullets(
                    "Sole designer on client products for early-stage startups: brand, web, and product across a dozen launches.",
                    "Established the studio's first reusable Figma libraries, cutting average project setup from days to hours.",
                ),
            ),
        ),
        section(
            "r7",
            row(
                card(
                    t("Craft", "label"),
                    bullets(
                        "Interaction & visual design",
                        "Prototyping (Figma, code)",
                        "Design systems",
                        "Motion & micro-interaction",
                    ),
                ),
                card(
                    t("Method", "label"),
                    bullets(
                        "Generative & evaluative research",
                        "Service blueprinting",
                        "Workshop facilitation",
                        "Design ops",
                    ),
                ),
                card(
                    t("Tools", "label"),
                    bullets(
                        "Figma, Framer, Origami",
                        "HTML / CSS / React",
                        "Storybook, Linear",
                        "After Effects",
                    ),
                ),
            ),
        ),
        section(
            "r8",
            split(
                60,
                group(
                    t("Selected projects", "label"),
                    t("Aster Design System", "h3"),
                    t(
                        "A single source of truth for four product teams: tokens, components, and usage guidelines that turned a fractured UI into one coherent voice. Documented, versioned, and adopted across web and mobile.",
                        "body",
                    ),
                    t(
                        "Merchant Dashboard 2.0 · Cadence Care Plans · Foglight client launches",
                        "caption",
                    ),
                ),
                img(pic(3), 0.82, 12),
            ),
        ),
        section(
            "r9",
            row(
                group(
                    t("Education", "label"),
                    t("Rhode Island School of Design", "h3"),
                    t("BFA, Graphic Design · 2013–2017", "caption"),
                    t("Senior thesis on type systems for data-dense interfaces.", "caption"),
                ),
                group(
                    t("Recognition", "label"),
                    bullets(
                        "Core77 Design Award, Interaction · 2023",
                        'Speaker, Config 2022: "Design systems that survive reorgs"',
                        "Awwwards Honorable Mention · 2019",
                    ),
                ),
            ),
        ),
        section(
            "r10",
            callout(
                "note",
                group(
                    t("What I value", "label"),
                    t(
                        "The best design work is quiet. I'd rather ship one flow that genuinely respects a person's time than ten features that demo well. I show up for the unglamorous middle (the edge cases, the empty states, the error copy) because that is where products earn trust.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "r11",
            group(
                t(
                    "Open to senior and lead product design roles, full-time or fractional.",
                    "subtitle",
                ),
                t("elena@vance.design · vance.design · in/elenavance", "caption"),
            ),
        ),
        section(
            "contact",
            group(
                t("REFERENCES & PORTFOLIO", "label"),
                linked(
                    "body",
                    ["vance.design", "https://vance.design"],
                    " · ",
                    ["elena@vance.design", "mailto:elena@vance.design"],
                    " · references on request, and they answer fast",
                ),
            ),
            { background: bgImage(pic(4, 1700, 1100), 0.35) },
        ),
    ],
    bgImage("https://images.pexels.com/photos/16557322/pexels-photo-16557322.jpeg", 0.2),
);

export const portfolio: ArtifactContent = web(
    "couture",
    [
        section(
            "hero",
            col(
                siteNav(
                    "STUDIO HALVORSEN",
                    menu(
                        "Work",
                        navLink("Fjord House", "#work"),
                        navLink("Hotel Amber", "#amber"),
                        navLink("The Glasshouse", "#more-work"),
                        navLink(
                            "Archive on Instagram",
                            "https://www.instagram.com/studiohalvorsen",
                        ),
                    ),
                    navLink("Studio", "#studio"),
                    navLink("Services", "#services"),
                    navCta("Enquire", "#contact"),
                ),
                t("STUDIO HALVORSEN", "label"),
                t("Light, made deliberate.", "h1"),
                t(
                    "An independent design studio working at the edge of architecture, brand, and the objects in between, for people who believe a space should be felt before it's understood.",
                    "subtitle",
                ),
                button("See the work", "#work"),
                pin(badge("Taking Q1 commissions"), "end", "start", {
                    dx: -28,
                    dy: 34,
                    rotate: 3,
                    z: 2,
                }),
            ),
            {
                bleed: true,
                background: bgImage(pic(5, 1700, 1100), 0.55),
                frame: { aspect: 16 / 7 },
            },
        ),
        section(
            "studio",
            split(
                40,
                img(pic(6), 0.82),
                col(
                    t("Statement", "label"),
                    t("We design the pause before the room speaks.", "h2"),
                    t(
                        "Founded in Oslo, Studio Halvorsen makes interiors, identities, and objects that hold their composure. We start with restraint and remove until only what matters is left. Then we make that one thing unforgettable. Sixteen years, three continents, one obsession with proportion.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "numbers",
            row(
                stat("120+", "projects completed"),
                stat("16", "years independent"),
                stat("9", "design awards"),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "work",
            col(
                t("Selected work", "label"),
                t("A few rooms we're proud of.", "h2"),
                t(
                    "Residential, hospitality, and retail, each a study in light, material, and the discipline of leaving things out.",
                    "body",
                ),
            ),
        ),
        section(
            "work-a",
            row(
                card(
                    img(pic(7), 1.2),
                    t("Fjord House", "h3"),
                    t("Private residence · Bergen · 2025", "caption"),
                ),
                card(
                    img(pic(8), 1.2),
                    t("Hotel Amber", "h3"),
                    t("28-room boutique hotel · Copenhagen · 2024", "caption"),
                ),
            ),
        ),
        section("interlude", col(t("Light is the one material we never buy.", "h2", "center")), {
            background: bgImage(pic(9, 1700, 1100), 0.5),
            bleed: true,
            frame: { aspect: 16 / 5 },
        }),
        section(
            "more-work",
            row(
                card(
                    img(pic(10), 1),
                    t("The Glasshouse", "h3"),
                    t("Café & roastery · Oslo", "caption"),
                ),
                card(
                    img(pic(11), 1),
                    t("Marlowe Flagship", "h3"),
                    t("Retail identity · London", "caption"),
                ),
                card(
                    img(pic(12), 1),
                    t("Linen Apartment", "h3"),
                    t("Pied-à-terre · Paris", "caption"),
                ),
            ),
        ),
        section(
            "amber",
            split(
                60,
                col(
                    t("In focus", "label"),
                    badge("FEATURED"),
                    t("Hotel Amber.", "h2"),
                    t(
                        "Twenty-eight rooms inside a former printing house. We kept the cast-iron columns, warmed everything in oak and brass, and let a single skylight do the work of a chandelier. It won the Wallpaper* Design Award the year it opened.",
                        "body",
                    ),
                    button("Read the project note", "https://studiohalvorsen.no/amber", {
                        variant: "outline",
                    }),
                ),
                img(pic(13), 0.92),
            ),
        ),
        section("services", col(t("What we do", "label"), t("Three ways to work with us.", "h2"))),
        section(
            "services-list",
            row(
                card(
                    t("Interiors", "h3"),
                    t(
                        "Full-service interior architecture, from first sketch to the last switch plate. Residential and hospitality.",
                        "body",
                    ),
                ),
                card(
                    t("Identity", "h3"),
                    t(
                        "Brand systems for places and makers: naming, type, and the small printed things people keep.",
                        "body",
                    ),
                ),
                card(
                    t("Objects", "h3"),
                    t(
                        "Limited-run furniture and lighting, designed in-house and made with workshops we've known for years.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "praise",
            quote(
                "They handed us a building we'd stopped seeing and gave it back as somewhere we never want to leave.",
                "Ines Lund · Owner, Hotel Amber",
            ),
            { background: bgImage(pic(14, 1700, 1100), 0.62), bleed: true },
        ),
        section(
            "contact",
            split(
                60,
                col(
                    t("Let's begin", "label"),
                    t("Tell us about the space.", "h2"),
                    t(
                        "We take on a handful of projects a year so each one gets all of us. If you've got a room, a brand, or an idea that deserves restraint, we'd love to hear it.",
                        "subtitle",
                    ),
                    row(
                        { align: "center" },
                        button("Start a project", "mailto:studio@halvorsen.no"),
                        button("See the archive", "https://www.instagram.com/studiohalvorsen", {
                            variant: "ghost",
                        }),
                    ),
                ),
                img(pic(15), 0.92),
            ),
            { bleed: true, background: bgImage(pic(16, 1700, 1100), 0.4) },
        ),
        section(
            "footer",
            col(
                divider(),
                row(
                    { justify: "between", align: "start" },
                    fitW(
                        col(
                            fitW(t("Studio Halvorsen", "h3")),
                            fitW(t("Thorvald Meyers gate 12, Oslo", "caption")),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("STUDIO", "label")),
                            fitW(
                                linked("caption", [
                                    "studio@halvorsen.no",
                                    "mailto:studio@halvorsen.no",
                                ]),
                            ),
                            fitW(linked("caption", ["+47 22 40 18 06", "tel:+4722401806"])),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("ELSEWHERE", "label")),
                            fitW(
                                linked(
                                    "caption",
                                    ["Instagram", "https://www.instagram.com/studiohalvorsen"],
                                    " · ",
                                    ["Pinterest", "https://www.pinterest.com/studiohalvorsen"],
                                ),
                            ),
                            fitW(t("Photography by Ingrid Sæther", "caption")),
                        ),
                    ),
                ),
            ),
        ),
    ],
    bgImage("https://images.pexels.com/photos/6757416/pexels-photo-6757416.jpeg", 0.3),
);

export const personalSite: ArtifactContent = web(
    "vellum",
    [
        section(
            "hero",
            col(
                siteNav(
                    "WREN HALLORAN",
                    navLink("Writing", "#writing"),
                    navLink("Work", "#now"),
                    navLink("The letter", "#letter"),
                    navCta("Say hello", "#contact"),
                ),
                t("WRITER · DESIGNER · FOUNDER", "label"),
                t("Wren Halloran", "h1"),
                t(
                    "I make small, durable software, and write about the craft of paying attention. Currently in Lisbon, building Quiet Machines.",
                    "subtitle",
                ),
                button("Read the essays", "#writing"),
            ),
            {
                bleed: true,
                background: bgImage(pic(17, 1700, 1100), 0.55),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "about",
            col(
                t("A few words", "label"),
                t("I build things meant to be kept.", "h2"),
                t(
                    "Most software is designed to be replaced by the next version, the next funding round, the next acquirer. I’m interested in the other kind: tools that earn a permanent place on your desk, that get quieter and more useful the longer you live with them.",
                    "body",
                ),
                t(
                    "For ten years I’ve moved between writing and design, and I’ve stopped pretending they’re different jobs. Both are really about deciding what to leave out. Everything here is an attempt at the same thing: less, but better, and made to last.",
                    "body",
                ),
            ),
        ),
        section(
            "story",
            split(
                40,
                img(pic(18), 0.9),
                col(
                    t("About", "label"),
                    t("A short version of a long story.", "h2"),
                    t(
                        "I started as a magazine editor, learned to code so I could fix our broken CMS, and never quite stopped. Since then I’ve shipped reading tools, run a tiny studio, and written essays that somehow found more readers than anything I made on purpose.",
                        "body",
                    ),
                    bullets(
                        "Founder of Quiet Machines, a two-person software studio",
                        "Author of the weekly letter “Slow Tools” (24,000 readers)",
                        "Previously design lead at Cadence; editor at The Margin",
                    ),
                ),
            ),
        ),
        section(
            "now",
            row(
                card(
                    badge("SHIPPING"),
                    t("Margin 2.0", "h3"),
                    t(
                        "A rebuild of my reading app around one idea: nothing you save is ever lost. Beta opens this autumn.",
                        "caption",
                    ),
                ),
                card(
                    badge("WRITING"),
                    t("The Attention Book", "h3"),
                    t(
                        "A short, illustrated book on focus as a craft. Roughly two-thirds drafted; out next year.",
                        "caption",
                    ),
                ),
                card(
                    badge("ADVISING"),
                    t("Two founders", "h3"),
                    t(
                        "Helping two early teams find the shape of their product before they write much code.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "writing",
            col(
                t("Selected writing", "label"),
                t("Essays people actually finished.", "h2"),
                divider(),
                row(
                    fill(
                        col(
                            t("In Praise of Software That Ends", "h3"),
                            t(
                                "On the quiet dignity of a tool that lets you reach the bottom.",
                                "caption",
                            ),
                        ),
                    ),
                    fitW(t("9 min · 2026", "caption")),
                ),
                divider(),
                row(
                    fill(
                        col(
                            t("The Last Honest Inbox", "h3"),
                            t(
                                "Why I rebuilt email for one person (me) and then kept it that way.",
                                "caption",
                            ),
                        ),
                    ),
                    fitW(t("12 min · 2025", "caption")),
                ),
                divider(),
                row(
                    fill(
                        col(
                            t("Notes on Making Things Small", "h3"),
                            t("A working theory of why less software outlives more.", "caption"),
                        ),
                    ),
                    fitW(t("7 min · 2025", "caption")),
                ),
                divider(),
                row(
                    fill(
                        col(
                            t("The Year I Stopped Shipping", "h3"),
                            t(
                                "Twelve months of maintenance, and what it taught me about scope.",
                                "caption",
                            ),
                        ),
                    ),
                    fitW(t("11 min · 2024", "caption")),
                ),
                divider(),
                button("Read the archive", "https://slowtools.substack.com/archive", {
                    variant: "ghost",
                }),
            ),
        ),
        section(
            "letter",
            col(
                t("SLOW TOOLS", "label", "center"),
                t("A letter most Sunday mornings.", "h2", "center"),
                t(
                    "One short essay a week on attention, craft, and software that ages well. Twenty-four thousand people read it; nobody has ever been sold anything in it.",
                    "subtitle",
                    "center",
                ),
                fitW(
                    row(
                        { align: "center" },
                        button("Subscribe free", "https://slowtools.substack.com"),
                        button("Read a recent issue", "https://slowtools.substack.com/archive", {
                            variant: "outline",
                        }),
                    ),
                ),
                t("No sponsors, no tracking, one click to leave.", "caption", "center"),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "margin",
            split(
                40,
                img(pic(19), 1),
                col(
                    t("Featured", "label"),
                    badge("LIVE"),
                    t("Margin, a reading app that forgets nothing.", "h2"),
                    t(
                        "Save anything, highlight freely, and trust that it will still be there in ten years. No feed, no algorithm, no expiry. Just your library, getting more valuable the longer you tend it.",
                        "body",
                    ),
                    button("Visit Margin", "https://margin.app", { variant: "outline" }),
                ),
            ),
        ),
        section(
            "numbers",
            row(
                stat("24K", "readers of the weekly “Slow Tools” letter"),
                stat("3", "products shipped and still maintained, years on"),
                stat("10 yrs", "moving between writing and design"),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "praise",
            row(
                quote(
                    "Wren is the rare maker who treats restraint as a feature. Working with her, the best ideas were always the ones she talked us out of.",
                    "Aoife Brennan · co-founder, Cadence",
                ),
                quote(
                    "Half my saved-articles graveyard is now things I’ve actually read, because of Margin. It’s the only software I’ve paid for twice.",
                    "Theo Marsh · reader since 2021",
                ),
            ),
        ),
        section(
            "press",
            col(
                t("ELSEWHERE", "label", "center"),
                row(
                    { justify: "evenly", align: "center" },
                    fitW(t("Offscreen", "h3")),
                    fitW(t("The Verge", "h3")),
                    fitW(t("Dense Discovery", "h3")),
                    fitW(t("Hacker News", "h3")),
                ),
                t(
                    "“A quiet manifesto for durable software.” · “Margin is reading, minus the noise.” · “Wren’s letter is a weekly exhale.”",
                    "caption",
                    "center",
                ),
            ),
        ),
        section(
            "contact",
            col(
                t("Say hello", "label"),
                t("Let’s make something that lasts.", "h2"),
                t(
                    "I take on a couple of small collaborations a year: writing, design, or the early shape of a product. If that sounds like you, I’d love to hear what you’re building.",
                    "subtitle",
                ),
                button("Email me", "mailto:wren@quietmachines.co"),
            ),
            { bleed: true, background: bgImage(pic(20, 1700, 1100), 0.45) },
        ),
        section(
            "footer",
            col(
                divider(),
                row(
                    { justify: "between", align: "start" },
                    fitW(
                        col(
                            fitW(t("Wren Halloran", "h3")),
                            fitW(t("Lisbon, most of the year", "caption")),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("WRITING", "label")),
                            fitW(
                                linked(
                                    "caption",
                                    ["Essays", "#writing"],
                                    " · ",
                                    ["The letter", "#letter"],
                                    " · ",
                                    ["The book", "https://quietmachines.co/book"],
                                ),
                            ),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("FIND ME", "label")),
                            fitW(
                                linked("caption", [
                                    "wren@quietmachines.co",
                                    "mailto:wren@quietmachines.co",
                                ]),
                            ),
                            fitW(
                                linked(
                                    "caption",
                                    ["Mastodon", "https://mastodon.social/@wrenhalloran"],
                                    " · ",
                                    ["Read.cv", "https://read.cv/wrenhalloran"],
                                ),
                            ),
                        ),
                    ),
                ),
            ),
        ),
    ],
    bgImage(pic(21, 1700, 1100), 0.32),
);

export const coverLetter: ArtifactContent = doc(
    "chalk",
    [
        section(
            "c1",
            group(
                t("COVER LETTER", "label"),
                t("Camille Laurent", "h1"),
                t("Application · Senior Product Designer, Northwind", "caption"),
                t("camille.laurent@hey.com · (415) 555-0142 · Portland, OR · June 2026", "caption"),
            ),
            { background: bgImage(pic(22, 1700, 1100), 0.55) },
        ),
        section(
            "c2",
            group(
                t("Dear Northwind team,", "subtitle"),
                t(
                    "I recommend your app to people without being asked, which for a money product is almost unheard of. Northwind is the rare financial tool that lowers my pulse instead of raising it. You design for calm in a category that profits from anxiety, and I’ve wanted to work on something like it for a long time. So when I saw the Senior Product Designer role open, I didn’t want to send the usual letter. I wanted to send a real one.",
                    "body",
                ),
            ),
        ),
        section(
            "c3",
            split(
                40,
                img(pic(23), 1.15),
                group(
                    t("What I’d bring", "label"),
                    t("Earning permission before asking for it.", "h2"),
                    t(
                        "At Folio I led the redesign of an onboarding flow that asked first-time users to connect their bank on screen one, and watched most of them leave. We rebuilt it around earning permission slowly: explain, then ask. Activation rose 38% and first-week drop-off was cut nearly in half, without a single dark pattern. It’s the work I’m proudest of, and it’s the kind of work Northwind already values.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "c4",
            group(
                t("Systems", "label"),
                t("Tools that scale past me.", "h3"),
                t(
                    "Good design shouldn’t depend on the designer being in the room. I built and shipped Atlas, Folio’s design system, and grew it from a Figma file into a living library adopted by six product teams. Consistency was the smaller half of it. What the system really bought was speed and trust: designers stopped reinventing the same date picker, and engineers stopped guessing.",
                    "body",
                ),
                stat("−40%", "time from design to shipped after Atlas was adopted"),
            ),
        ),
        section(
            "c5",
            group(
                t("Craft", "label"),
                t("Accessible by default, not as an afterthought.", "h3"),
                t(
                    "Last year I led an accessibility overhaul that brought our core flows to WCAG 2.2 AA, re-thinking contrast, focus order, and screen-reader copy across the product. I also mentored three junior designers through it, because the surest way to keep standards high is to make sure you’re not the only one who can hold them.",
                    "body",
                ),
            ),
        ),
        section(
            "c6",
            quote(
                "Camille is the rare designer who can hold the whole system in her head and still sweat a single label. She raised the bar for the entire team, and made the rest of us want to clear it.",
                "Devin Park · Head of Design, Folio",
            ),
        ),
        section(
            "c7",
            callout(
                "note",
                t(
                    "A few practical notes: I’m based in Portland and happy to relocate or keep to your hours. I’m available from August, and I’d be glad to begin with a short paid design exercise. It’s the fastest honest way for both of us to see how we work together.",
                    "body",
                ),
            ),
        ),
        section(
            "c8",
            group(
                t(
                    "I’ve admired Northwind from the outside for two years; I’d love the chance to make it better from the inside. Thank you for reading this far. I know your time is short, and I’ve tried to be worth it.",
                    "body",
                ),
            ),
        ),
        section(
            "c9",
            group(
                divider(),
                t("Warmly,", "body"),
                t("Camille Laurent", "h3"),
                t("Portfolio: camillelaurent.design · LinkedIn: in/camille-laurent", "caption"),
            ),
        ),
        section(
            "ninety",
            group(
                t("If we work together, the first ninety days", "label"),
                bullets(
                    "Weeks 1 to 4: ship something small end to end; trust is built in production",
                    "Weeks 5 to 8: the onboarding audit, with numbers attached to every opinion",
                    "Weeks 9 to 12: one measurable bet from the audit, designed, tested, live",
                ),
            ),
        ),
        section(
            "sample",
            split(
                60,
                group(
                    t("A SAMPLE, UNPROMPTED", "label"),
                    t(
                        "Page one of the teardown: your activation email arrives 40 minutes after signup, which is 39 minutes after curiosity peaks. The fix costs one queue setting.",
                        "body",
                    ),
                ),
                img(pic(24), 0.82),
            ),
        ),
        section(
            "ps",
            group(
                t("P.S.", "label"),
                t(
                    "The onboarding teardown mentioned above is three pages and already written. Happy to send it along whether or not we end up talking.",
                    "body",
                ),
            ),
            { background: bgImage(pic(25, 1700, 1100), 0.4) },
        ),
    ],
    bgImage("https://images.pexels.com/photos/20899958/pexels-photo-20899958.jpeg", 0.28),
);

export const eventInvite: ArtifactContent = web(
    "loft",
    [
        section(
            "hero",
            col(
                siteNav(
                    "AMARA & THÉO",
                    navLink("The day", "#schedule"),
                    navLink("Travel", "#travel"),
                    navLink("Registry", "https://amaraandtheo.love/registry"),
                    navCta("RSVP", "#rsvp"),
                ),
                t("WITH JOYFUL HEARTS, TOGETHER WITH THEIR FAMILIES", "label"),
                t("Amara & Théo", "h1"),
                t(
                    "are getting married, and they would be overjoyed for you to be there, under the olive trees, when they say yes.",
                    "subtitle",
                ),
                t("Quinta da Lua · Sintra, Portugal", "caption"),
                button("RSVP by 1 August", "#rsvp"),
                pin(badge("Save the date · 12 September"), "end", "start", {
                    dx: -28,
                    dy: 30,
                    rotate: -5,
                    z: 2,
                }),
            ),
            {
                bleed: true,
                background: bgImage(pic(26, 1700, 1100), 0.55),
                frame: { aspect: 16 / 7 },
            },
        ),

        section(
            "note",
            col(
                t("A NOTE FROM US", "label"),
                t("Eight years, two cities, and one very good dog later.", "h2"),
                t(
                    "We met in a rained-out queue for a film neither of us ended up seeing, and we have been choosing each other on purpose every day since.",
                    "subtitle",
                ),
                t(
                    "This September we're gathering the people who made us who we are, in a hillside grove above Sintra with the sea somewhere over the trees, to make it official and then to dance about it for as long as the band will let us. There's no part of this day that matters more than having you in it. So please: come early, stay late, wear shoes you can lose.",
                    "body",
                ),
            ),
        ),

        section(
            "us",
            split(
                60,
                col(
                    t("THE TWO OF US", "label"),
                    t("Amara, who plans everything. Théo, who plans nothing.", "h2"),
                    t(
                        "Amara grew up in Lagos and London and reads three books at once; Théo is from Porto, cooks like he's feeding an army, and has never once been on time. Somehow it works. Most weekends you'll find us at the market, arguing happily about which tomatoes to buy and where to put the future couch.",
                        "body",
                    ),
                    t("Yours, Amara & Théo", "caption"),
                ),
                img(pic(27), 0.84),
            ),
        ),

        section("olive", col(t("Come for the vows. Stay for the figs.", "h2", "center")), {
            background: bgImage(pic(28, 1700, 1100), 0.45),
            bleed: true,
            frame: { aspect: 16 / 5 },
        }),

        section(
            "details",
            row(
                card(
                    img(pic(29), 1),
                    t("The Ceremony", "h3"),
                    t("4:00 PM · The Olive Terrace · please be seated by 3:45", "caption"),
                ),
                card(
                    img(pic(30), 1),
                    t("The Reception", "h3"),
                    t("6:00 PM · The Stone Barn · dinner, toasts & dancing to follow", "caption"),
                ),
                card(
                    img(pic(31), 1),
                    t("What to Wear", "h3"),
                    t("Garden formal · soft colours · flat-friendly for grass & gravel", "caption"),
                ),
            ),
        ),

        section(
            "schedule",
            col(
                t("THE DAY, HOUR BY HOUR", "label"),
                t("How Saturday will unfold.", "h2"),
                table(
                    "Time,What's happening,Where\n3:30 PM,Arrival & welcome drinks,The Lower Courtyard\n4:00 PM,Ceremony,The Olive Terrace\n4:45 PM,Photos & golden-hour aperitivo,The Garden\n6:00 PM,Dinner & toasts,The Stone Barn\n8:30 PM,First dance & the band,The Barn\n11:00 PM,Late-night snacks & last orders,The Courtyard\n12:00 AM,Sparkler send-off,The Drive",
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),

        section(
            "venue",
            col(
                t("THE PLACE", "label"),
                t("Quinta da Lua", "h2"),
                t(
                    "A working olive farm folded into the green hills above Sintra: terracotta, old stone, and rows of silver trees that go gold at dusk. It's a forty-minute drive from Lisbon and feels a hundred years from anywhere.",
                    "subtitle",
                ),
                button("Open the map", "https://maps.google.com/?q=Sintra+Portugal", {
                    variant: "outline",
                }),
            ),
            { bleed: true, background: bgImage(pic(32, 1700, 1100), 0.5) },
        ),

        section(
            "travel",
            col(
                t("GETTING HERE & STAYING OVER", "label"),
                t("Everything you'll want to know.", "h2"),
                faq(
                    "collapsible",
                    [
                        [
                            "How do I get to the quinta?",
                            "Fly into Lisbon (LIS) and drive about forty minutes north. We'll run shuttle vans from central Sintra at 3:00 and 3:20 PM, and they'll take you back down whenever you're ready to go.",
                        ],
                        [
                            "Can I drive and park?",
                            "Yes. There's free parking on the lower drive, and you're welcome to leave the car overnight and collect it the next morning. Taxis reach the gate too, but book the return ahead: signal is thin in the hills.",
                        ],
                        [
                            "Where should I stay?",
                            "We've held a block of rooms at Casa do Vale in Sintra under the code AMARATHEO until 1 August. Sintra's old town is the prettiest base, and Cascais is lovelier still if you want to be near the sea.",
                        ],
                        [
                            "Is there anything the morning after?",
                            "There is. Coffee and pastries at the quinta from ten, and a long, slow brunch in Lisbon for anyone still standing.",
                        ],
                        [
                            "Can we bring the children?",
                            "Please do. We adore them, and there's a quiet room with a sitter from 8 PM so you can stay for the dancing. Just tell us when you reply.",
                        ],
                    ],
                    true,
                ),
            ),
        ),

        section(
            "gallery",
            row(
                col(img(pic(33), 0.8), t("The grove at the hour we'll marry.", "caption")),
                col(
                    img(pic(34), 0.8),
                    t("Long tables, figs, and far too many candles.", "caption"),
                ),
                col(img(pic(35), 0.8), t("And then, the part with the dancing.", "caption")),
            ),
        ),

        section(
            "praise",
            quote(
                "These two make everyone around them feel like the most interesting person in the room. Come September, that room has a sea view.",
                "Lena · maid of honour",
            ),
            { background: bgImage(pic(36, 1700, 1100), 0.6), bleed: true },
        ),

        section(
            "rsvp",
            col(
                t("THE ONLY HOMEWORK", "label", "center"),
                t("Let us know you're coming.", "h2", "center"),
                t(
                    "Kindly reply by 1 August so we can save you a seat, a glass, and a place at the long table. Tell us about dietary needs, songs that will get you dancing, and whether you'll need a shuttle.",
                    "subtitle",
                    "center",
                ),
                button("RSVP at amaraandtheo.love", "https://amaraandtheo.love/rsvp", {
                    shape: "pill",
                    size: "lg",
                }),
                t("Replies close 1 August 2026.", "caption", "center"),
            ),
            { background: bgTone("accent"), bleed: true },
        ),

        section(
            "footer",
            col(
                divider(),
                row(
                    { justify: "between", align: "start" },
                    fitW(
                        col(
                            fitW(t("Amara & Théo", "h3")),
                            fitW(t("12 September 2026 · Sintra", "caption")),
                            fitW(
                                linked("caption", [
                                    "hello@amaraandtheo.love",
                                    "mailto:hello@amaraandtheo.love",
                                ]),
                            ),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("GIFTS", "label")),
                            fitW(t("Your presence is the whole gift.", "caption")),
                            fitW(
                                linked(
                                    "caption",
                                    "If you'd like to do more, we're ",
                                    ["saving for the Azores", "https://amaraandtheo.love/registry"],
                                    ".",
                                ),
                            ),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("SHARE THE DAY", "label")),
                            fitW(t("Tag your photos #AmaraAndTheo", "caption")),
                            fitW(
                                linked("caption", [
                                    "amaraandtheo.love",
                                    "https://amaraandtheo.love",
                                ]),
                            ),
                        ),
                    ),
                ),
                divider(),
                t(
                    "With love, and with thanks to our parents, Ngozi & Emeka Okonkwo and Inês & Rui Almeida, who started all of this.",
                    "caption",
                    "center",
                ),
            ),
        ),
    ],
    bgImage(pic(37, 1700, 1100), 0.3),
);

export const photoEssay: ArtifactContent = doc(
    "atelier",
    [
        section(
            "s1",
            group(
                t("A PHOTO ESSAY", "label"),
                t("Before the City Wakes", "h1"),
                t(
                    "One hour in New York, between the last night train and the first coffee cart, when the loudest city on earth briefly forgets to speak.",
                    "subtitle",
                ),
                t("Photographs & words by Jonah Reyes · winter, 5:40 AM", "caption"),
            ),
            { background: bgImage(pic(38, 1700, 1100), 0.55) },
        ),

        section(
            "s2",
            group(
                t("The opening", "label"),
                t(
                    "I started waking before the city to find out who it is when nobody is watching.",
                    "subtitle",
                ),
                t(
                    "There is an hour here that visitors never meet, too late to be night and too early to be morning, when New York sets itself down like a held breath. The bars have surrendered. The bakeries have not yet switched their ovens on. For maybe sixty minutes the streets are returned to the bridges, the river, the steam rising through the grates, and the few of us foolish enough to be out in the cold to see it.",
                    "body",
                ),
                t(
                    "These are the pictures I came home with, and the small things I noticed only because there was nothing else to look at.",
                    "body",
                ),
            ),
        ),

        section(
            "s3",
            group(
                img(pic(39), 1.6),
                t(
                    "Washington Street, 5:48. The bridge hangs in the gap between two rows of brick like a picture no one ever takes down. I stood in the middle of the road to make this, and nothing asked me to move.",
                    "caption",
                ),
            ),
        ),

        section(
            "s4",
            split(
                40,
                group(
                    img(pic(40), 1.05),
                    pin(
                        w(64, card(t("Platform 6, four minutes between trains.", "caption"))),
                        "start",
                        "end",
                        { dx: -20, dy: 16, rotate: -3, z: 2 },
                    ),
                ),
                group(
                    t("Underground", "label"),
                    t("The first train", "h2"),
                    t(
                        "She was the only other person on the platform, and neither of us pretended otherwise. The express came through without stopping, dragging its own wind behind it, and for a moment the station was a river with a current. Then it was a room again. Somewhere above us the city slept on, unbothered.",
                        "body",
                    ),
                ),
            ),
        ),

        section(
            "s5",
            group(
                img(pic(41), 1.6),
                t(
                    "The hour the lights give up: every window still burning from the night before, and the sky already deciding otherwise. By six the argument will be over.",
                    "caption",
                ),
            ),
        ),

        section(
            "s6",
            split(
                60,
                group(
                    t("Lower East Side", "label"),
                    t("The fire escapes", "h2"),
                    t(
                        "No one builds them like this anymore: iron stitched across the face of every building, zigzagging down toward streets that have never once needed them. At this hour they hold nothing but frost and a few determined pigeons. A hundred years of mornings have rusted them the exact color of the brick, as if the buildings grew them on purpose.",
                        "body",
                    ),
                ),
                img(pic(42), 0.82),
            ),
        ),

        section(
            "s7",
            row(
                group(
                    img(pic(43), 0.8),
                    t("A street built for thousands, rehearsing in an empty house.", "caption"),
                ),
                group(
                    img(pic(44), 0.8),
                    t(
                        "The escalator runs all night whether anyone rides it or not. There is a kind of faith in that.",
                        "caption",
                    ),
                ),
                group(
                    img(pic(45), 0.8),
                    t(
                        "SoHo before the shutters go up, when the cast iron gets the street to itself.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "s8",
            quote(
                "I came for the skyline and stayed for the hour underneath it, which no lens has ever once held still.",
                "From field notes, the third morning",
            ),
            { background: bgImage(pic(46, 1700, 1100), 0.55) },
        ),

        section(
            "s9",
            split(
                40,
                img(pic(47), 1.08),
                group(
                    t("Grand Central", "label"),
                    t("First light on the concourse", "h2"),
                    t(
                        "The east windows do their famous trick a little after seven, laying the sun across the marble in bars the width of train cars. A handful of early commuters walk through the beams without looking up. The light has been arriving like this for a century; the timetable, apparently, is the one thing in this station that never changed.",
                        "body",
                    ),
                ),
            ),
        ),

        section(
            "s10",
            group(
                img(pic(48), 1.6),
                t(
                    "Midtown from forty floors up, still in its blue hour. From this height the city looks like it is only pretending to sleep, which is, of course, the truth.",
                    "caption",
                ),
            ),
        ),

        section(
            "s11",
            split(
                60,
                group(
                    t("The promenade", "label"),
                    t("The watcher", "h2"),
                    t(
                        "There is always one other person. This morning she had taken the bench facing the river, snow on the slats beside her, the skyline across the water still wearing its lights. She did not photograph it. She just sat with it, the way you sit with an old friend who does not require conversation, and I went the long way around so as not to interrupt.",
                        "body",
                    ),
                ),
                img(pic(49), 0.82),
            ),
        ),

        section(
            "s12",
            group(
                t("The closing", "label"),
                t("And then the coffee carts", "h2"),
                t(
                    "It ends the same way each time. A cart bolts its awning open on Lexington, a shutter rolls up with a clatter, the first taxi finds the first fare. The spell, which was never really mine to keep, lifts. The city stretches, remembers itself, and takes its streets back. I put the lens cap on and walk home into the noise, already a little homesick for an hour that has not even finished leaving.",
                    "body",
                ),
                t("Jonah, walking home over the bridge", "caption"),
            ),
            { background: bgImage(pic(50, 1700, 1100), 0.5) },
        ),
    ],
    bgImage("https://images.pexels.com/photos/8941369/pexels-photo-8941369.jpeg", 0.3),
);

export const productLaunch: ArtifactContent = web(
    "moss",
    [
        section(
            "hero",
            col(
                siteNav(
                    "AER",
                    menu(
                        "Explore",
                        navLink("The device", "#product"),
                        navLink("See it running", "#demo"),
                        navLink("How it works", "#how"),
                        navLink("Specifications", "#specs"),
                        navLink("What we measured", "#data"),
                        navLink("Support", "https://help.aerone.com"),
                    ),
                    navLink("Pricing", "#pricing"),
                    navCta("Pre-order", "#preorder"),
                ),
                t("Introducing Aer One", "label"),
                t("The air you forgot you were breathing.", "h1"),
                t(
                    "A whisper-quiet purifier that reads your room and clears it in minutes: no app to babysit, no filters you’ll forget to change.",
                    "subtitle",
                ),
                button("Pre-order · $249", "#preorder"),
                pin(badge("Ships October 12"), "end", "start", {
                    dx: -28,
                    dy: 8,
                    rotate: -4,
                    z: 2,
                }),
            ),
            {
                bleed: true,
                background: bgImage(pic(51, 1700, 1100), 0.58),
                frame: { aspect: 16 / 7 },
            },
        ),
        section(
            "problem",
            split(
                60,
                col(
                    t("The problem", "label"),
                    t("Indoor air is the pollution nobody talks about.", "h2"),
                    t(
                        "We spend 90% of our lives indoors, where the air can be up to five times more polluted than the street outside, from cooking smoke and off-gassing furniture to pollen, pet dander, and the fine particles that slip past every cheap filter. Most purifiers either roar like a jet or quietly do nothing at all.",
                        "body",
                    ),
                ),
                img(pic(52), 0.92),
            ),
        ),
        section(
            "proof",
            row(
                stat("99.97%", "of particles down to 0.1 microns captured"),
                stat("12 min", "to clear a 400 sq ft room"),
                stat("21 dB", "quieter than a library at night"),
            ),
            { background: bgImage(pic(53, 1700, 1100), 0.5), bleed: true },
        ),
        section(
            "product",
            split(
                40,
                img(pic(54), 1.05),
                col(
                    t("Meet Aer One", "label"),
                    t("Engineered to disappear into your home.", "h2"),
                    t(
                        "A single seamless aluminum shell, a fabric crown spun from recycled PET, and a glow ring that fades from amber to white as your air gets cleaner. It’s the first purifier we’ve made that people leave out on purpose.",
                        "body",
                    ),
                    button("Take the tour", "#how", { variant: "outline" }),
                ),
            ),
        ),
        section(
            "demo",
            col(
                t("Two minutes", "label", "center"),
                t("Watch a room clear itself.", "h2", "center"),
                t(
                    "A sealed 400 sq ft kitchen, one seared steak, and a particle counter running the whole time. Nothing is sped up.",
                    "subtitle",
                    "center",
                ),
                video(DEMO_VIDEO, pic(55, 1280, 720)),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "sensing",
            split(
                60,
                col(
                    t("Intelligence", "label"),
                    badge("ON-DEVICE"),
                    t("It senses, then it acts.", "h2"),
                    t(
                        "Four laser sensors sample the room sixty times a second. When you sear a steak or the pollen count spikes, Aer One spins up before you’d ever notice, then settles back to a hush the moment the air is clear. All of it runs on the device. Nothing leaves your home.",
                        "body",
                    ),
                ),
                img(pic(56), 0.92),
            ),
        ),
        section(
            "how",
            col(
                t("How it works", "label"),
                t("Four stages, one breath.", "h2"),
                t(
                    "Air is pulled in from every direction, stripped of particles and gases, and returned cooler and cleaner than it came, a full pass every ninety seconds.",
                    "body",
                ),
                diagram("process", "Draw in, Pre-filter, HEPA + carbon, Return clean", 240),
            ),
        ),
        section(
            "specs",
            col(
                t("Specifications", "label"),
                t("The numbers, in full.", "h2"),
                table(
                    "Model,Room size,Noise range,Filter life,Weight,Price\nAer One,Up to 400 sq ft,21–48 dB,12 months,4.1 kg,$249\nAer One Plus,Up to 650 sq ft,23–52 dB,18 months,5.6 kg,$329",
                ),
                t(
                    "Both models draw under 6 W on the lowest setting and share the same filter chemistry; the Plus adds a larger fan and a deeper carbon bed.",
                    "caption",
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "features",
            row(
                card(
                    img(pic(57), 1),
                    t("One-click filter", "h3"),
                    t(
                        "A magnetic cartridge swaps in five seconds, and the device tells you the exact day it’s due.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(58), 1),
                    t("Sleep mode", "h3"),
                    t(
                        "The glow ring dims to nothing and the fan drops below a whisper, so it works while you don’t hear it.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(59), 1),
                    t("Built to last", "h3"),
                    t(
                        "Repairable by design, a five-year warranty, and a shell spun from 100% recycled aluminum.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "reviews",
            split(
                60,
                testimonial(
                    "I stopped waking up congested within a week. I didn’t expect to feel the difference, but the whole house notices when it’s off.",
                    "Dr. Lena Osei",
                    "Pulmonologist · early tester",
                    "https://i.pravatar.cc/240?img=45",
                ),
                col(
                    stat("4.9★", "average across 2,300 beta reviews"),
                    stat("96%", "would replace their old purifier"),
                ),
            ),
            { background: bgImage(pic(60, 1700, 1100), 0.55), bleed: true },
        ),
        section(
            "data",
            split(
                40,
                col(
                    t("What we measured", "label"),
                    t("From hazy to clear in twelve minutes.", "h2"),
                    t(
                        "Particulate count (PM2.5) in a sealed 400 sq ft room after a stovetop sear, sampled every two minutes. Lower is cleaner.",
                        "body",
                    ),
                ),
                chart("line", "182, 168, 121, 74, 41, 18, 9, 4", 240),
            ),
        ),
        section(
            "pricing",
            col(
                t("Pricing", "label"),
                t("Reserve one now, pay the rest at dispatch.", "h2"),
                row(
                    { align: "start" },
                    pricing(
                        "AER ONE",
                        "$249",
                        "Up to 400 sq ft · ships March",
                        [
                            "True HEPA H13 + carbon",
                            "12-month filter included",
                            "Five-year warranty",
                            "60-night trial at home",
                        ],
                        button("Pre-order Aer One", "#preorder"),
                    ),
                    pricing(
                        "AER ONE PLUS",
                        "$329",
                        "Up to 650 sq ft · ships April",
                        [
                            "Everything in Aer One",
                            "Larger fan, deeper carbon bed",
                            "18-month filter included",
                            "Priority dispatch",
                        ],
                        button("Pre-order the Plus", "#preorder", { variant: "outline" }),
                    ),
                ),
                t(
                    "Aer Care is $6 a month and entirely optional: filters arrive the week they’re due and the warranty extends for as long as you keep it.",
                    "caption",
                ),
            ),
        ),
        section(
            "faq",
            col(
                t("Frequently asked", "label"),
                t("The honest answers.", "h2"),
                faq(
                    "collapsible",
                    [
                        [
                            "Is it really HEPA?",
                            "Yes: true HEPA H13, independently certified, not the “HEPA-type” media most cheap purifiers ship with. The test report is linked from every product page.",
                        ],
                        [
                            "How often do filters change?",
                            "Once a year on the Aer One and every eighteen months on the Plus. The device counts real runtime rather than calendar days, so a quiet season buys you longer.",
                        ],
                        [
                            "Do I need the app?",
                            "No. Everything works on the device, and nothing breaks if you never install it. The app only adds history charts and a filter reminder.",
                        ],
                        [
                            "What if I don’t notice a difference?",
                            "Sleep on it for sixty nights. If your air doesn’t feel different, send it back and we refund every cent, return shipping included.",
                        ],
                        [
                            "When does my pre-order ship?",
                            "First units leave in March, in the order they were placed. Your $25 deposit is fully refundable until the day yours is boxed.",
                        ],
                    ],
                    true,
                ),
            ),
        ),
        section(
            "preorder",
            col(
                t("Breathe better, starting now", "label", "center"),
                t("Your first clear breath ships in March.", "h2", "center"),
                t(
                    "Reserve yours today with a fully refundable $25 deposit and lock in launch pricing before it goes up.",
                    "subtitle",
                    "center",
                ),
                button("Pre-order Aer One", "https://aerone.com/preorder", { size: "lg" }),
                t("Free shipping across North America · 2–4 days", "caption", "center"),
            ),
            { background: bgImage(pic(61, 1700, 1100), 0.55), bleed: true },
        ),
    ],
    bgImage(pic(62, 1700, 1100), 0.32),
);

export const landingPage: ArtifactContent = web(
    "press",
    [
        section(
            "hero",
            col(
                siteNav(
                    "NORTHWIND",
                    menu(
                        "Product",
                        navLink("What it does", "#features"),
                        navLink("Live metrics", "#live"),
                        navLink("What teams save", "#why"),
                        navLink("Questions", "#faq"),
                        navLink("Status page", "https://status.northwind.dev"),
                    ),
                    navLink("Pricing", "#pricing"),
                    navLink("Docs", "https://docs.northwind.dev"),
                    navCta("Start free", "#signup"),
                ),
                t("Northwind Analytics", "label"),
                t("Your metrics, finally in one place.", "h1"),
                t(
                    "Connect every tool your team already uses and watch a single, trustworthy dashboard build itself: no SQL, no data team, no waiting on a Monday report.",
                    "subtitle",
                ),
                row(
                    { align: "center" },
                    button("Start free, no card", "#signup"),
                    button("See the pricing", "#pricing", { variant: "outline" }),
                ),
                pin(
                    w(22, card(t("LIVE", "label"), t("p95 at 42ms as you read this.", "body"))),
                    "end",
                    "end",
                    { dx: -28, dy: 108, z: 2 },
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(63, 1700, 1100), 0.52),
                frame: { aspect: 16 / 8 },
            },
        ),
        section("shot", col(t("One screen, every source", "label"), img(pic(64), 1.7))),
        section(
            "logos",
            col(
                t("TRUSTED BY FAST-MOVING TEAMS", "label", "center"),
                row(
                    { justify: "evenly", align: "center" },
                    fitW(t("LUMEN", "h3")),
                    fitW(t("CEDARWORKS", "h3")),
                    fitW(t("HALOWAY", "h3")),
                    fitW(t("NORRØN", "h3")),
                    fitW(t("BELLWEATHER", "h3")),
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "numbers",
            row(
                stat("8,400+", "teams shipping with Northwind"),
                stat("42M", "events processed every day"),
                stat("99.99%", "uptime over the last 12 months"),
            ),
        ),
        section(
            "features",
            col(
                t("What it does", "label"),
                t("Three jobs, one afternoon.", "h2"),
                tabs(
                    "Connect, Ask, Share",
                    split(
                        45,
                        img(pic(65), 1.35),
                        col(
                            t("Connect in minutes", "h3"),
                            t(
                                "Forty native integrations (Stripe, Postgres, HubSpot, GA4 and the rest) go live the moment you click connect. No warehouse to stand up first, and no engineer on the hook for the pipeline.",
                                "body",
                            ),
                            checks(
                                "40 native sources, OAuth in one click",
                                "Incremental syncs every 60 seconds",
                                "Bring your own warehouse if you have one",
                            ),
                        ),
                    ),
                    split(
                        45,
                        img(pic(66), 1.35),
                        col(
                            t("Ask in plain English", "h3"),
                            t(
                                "Type “revenue by plan last quarter” and get a chart you can trust, then open the SQL underneath it and edit anything you disagree with. Every answer shows its working.",
                                "body",
                            ),
                            checks(
                                "Generated SQL is always visible and editable",
                                "Saved answers become dashboard tiles",
                                "Definitions live in one shared metric layer",
                            ),
                        ),
                    ),
                    split(
                        45,
                        img(pic(67), 1.35),
                        col(
                            t("Share without friction", "h3"),
                            t(
                                "Dashboards, alerts, and weekly digests land where your team already works: Slack, email, or the TV on the wall. Read access costs nothing, so nobody is stuck screenshotting a number.",
                                "body",
                            ),
                            checks(
                                "Unlimited free viewers on every plan",
                                "Slack and email digests on a schedule",
                                "Public links with an expiry, when you need one",
                            ),
                        ),
                    ),
                ),
            ),
        ),
        section(
            "live",
            split(
                40,
                img(pic(68), 1.05),
                col(
                    t("Always current", "label"),
                    badge("REAL-TIME"),
                    t("Numbers that move when your business does.", "h2"),
                    t(
                        "Northwind streams your data instead of batching it overnight, so the figure on the screen is the figure right now. Set a threshold once and we’ll ping you the instant signups dip or churn spikes, long before it shows up in a monthly review.",
                        "body",
                    ),
                    button("See it live", "#signup", { variant: "outline" }),
                ),
            ),
            { background: bgImage(pic(69, 1700, 1100), 0.5), bleed: true },
        ),
        section(
            "why",
            split(
                60,
                col(
                    t("Why teams switch", "label"),
                    t("Less time wrangling, more time deciding.", "h2"),
                    t(
                        "Average hours per week our customers spend building reports, before Northwind and after their first month.",
                        "body",
                    ),
                ),
                chart("column", "11, 9, 4, 2, 1", 240),
            ),
        ),
        section(
            "praise",
            col(
                t("What changed for them", "label"),
                row(
                    testimonial(
                        "We replaced a $90k BI contract and two spreadsheets with Northwind in an afternoon. Our whole company reads the same numbers now.",
                        "Priya Raman",
                        "VP Growth, Cedarworks",
                        "https://i.pravatar.cc/240?img=32",
                    ),
                    testimonial(
                        "I’m not technical, and I built our exec dashboard myself on day one. That has never once been true of an analytics tool.",
                        "Tom Becker",
                        "Founder, Haloway",
                        "https://i.pravatar.cc/240?img=12",
                    ),
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "pricing",
            col(
                t("Pricing", "label"),
                t("Start free. Grow when you’re ready.", "h2"),
                t(
                    "Every plan includes unlimited viewers, because a metric nobody can see is not worth collecting. Enterprise adds SAML, a private deployment, and a migration engineer for your first month; annual billing takes two months off any plan.",
                    "body",
                ),
            ),
        ),
        section(
            "tiers",
            row(
                { align: "start" },
                pricing(
                    "FREE",
                    "$0",
                    "For a side project",
                    ["3 data sources", "Unlimited viewers", "7-day history", "Community support"],
                    button("Start free", "#signup", { variant: "outline" }),
                ),
                pricing(
                    "TEAM",
                    "$49",
                    "Per month, for a growing startup",
                    [
                        "15 data sources",
                        "Alerts and Slack digests",
                        "12-month history",
                        "Email support",
                    ],
                    button("Start a trial", "#signup"),
                ),
                pricing(
                    "BUSINESS",
                    "$199",
                    "Per month, for a scaling company",
                    [
                        "Unlimited sources",
                        "SSO and audit log",
                        "Unlimited history",
                        "Named support engineer",
                    ],
                    button("Talk to us", "https://northwind.dev/contact", {
                        variant: "outline",
                    }),
                ),
            ),
        ),
        section(
            "faq",
            col(
                t("Questions, answered", "label"),
                t("Everything before you sign up.", "h2"),
                faq(
                    "collapsible",
                    [
                        [
                            "Is the free plan really free?",
                            "Yes, and permanently: three sources, unlimited viewers, no trial clock and no card. We only charge when you outgrow it.",
                        ],
                        [
                            "How long does setup take?",
                            "Most teams have a live dashboard inside ten minutes. If you’re moving off another tool, our team will rebuild your old reports for free.",
                        ],
                        [
                            "Where does my data live?",
                            "In your region, encrypted in transit and at rest. We’re SOC 2 Type II certified and the report is available under NDA.",
                        ],
                        [
                            "Can I get my data out?",
                            "Any time, in one click: CSV for the tables, SQL for the queries, JSON for the dashboards. Cancelling never locks anything up.",
                        ],
                        [
                            "Do you charge for viewers?",
                            "No. Read access is free on every plan. Charging per seat only teaches a team to screenshot numbers instead of sharing them.",
                        ],
                    ],
                    true,
                ),
            ),
        ),
        section(
            "signup",
            col(
                t("Ten minutes to your first dashboard", "label", "center"),
                t("Start free. Bring the whole team.", "h2", "center"),
                t(
                    "Connect a source, ask one question, and share the answer before your coffee goes cold. No card, no sales call, no data engineer.",
                    "subtitle",
                    "center",
                ),
                fitW(
                    row(
                        { align: "center" },
                        button("Create your free workspace", "https://app.northwind.dev/signup", {
                            size: "lg",
                        }),
                        button("Read the docs", "https://docs.northwind.dev", {
                            variant: "ghost",
                        }),
                    ),
                ),
            ),
            { background: bgTone("contrast"), bleed: true },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Northwind", "h3")),
                        fitW(t("Analytics for teams without a data team.", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("PRODUCT", "label")),
                        fitW(
                            linked(
                                "caption",
                                ["Integrations", "https://northwind.dev/integrations"],
                                " · ",
                                ["Pricing", "#pricing"],
                                " · ",
                                ["Changelog", "https://northwind.dev/changelog"],
                            ),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("COMPANY", "label")),
                        fitW(
                            linked(
                                "caption",
                                ["About", "https://northwind.dev/about"],
                                " · ",
                                ["Careers", "https://northwind.dev/careers"],
                                " · ",
                                ["Security", "https://northwind.dev/security"],
                            ),
                        ),
                        fitW(
                            linked("caption", [
                                "hello@northwind.dev",
                                "mailto:hello@northwind.dev",
                            ]),
                        ),
                    ),
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
    ],
    bgImage(pic(70, 1700, 1100), 0.3),
);

export const eventPage: ArtifactContent = web(
    "obsidian",
    [
        section(
            "hero",
            col(
                siteNav(
                    "FREQUENCY 2026",
                    menu(
                        "Programme",
                        navLink("Speakers", "#speakers"),
                        navLink("The agenda", "#agenda"),
                        navLink("The venue", "#venue"),
                        navLink("Good to know", "#faq"),
                        navLink("Last year’s recap", "https://frequency.fest/2025"),
                    ),
                    navLink("Tickets", "#tickets"),
                    navCta("Register", "#register"),
                ),
                t("Frequency 2026 · A design + technology festival", "label"),
                t("Where design meets the machine.", "h1"),
                t(
                    "Three days of talks, workshops, and after-dark sessions on the new craft of building with AI. October 15–17, 2026 · Lx Factory, Lisbon.",
                    "subtitle",
                ),
                row(
                    { align: "center" },
                    button("Register now", "#register"),
                    button("See the lineup", "#speakers", { variant: "outline" }),
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(71, 1700, 1100), 0.58),
                frame: { aspect: 16 / 7 },
            },
        ),
        section(
            "about",
            split(
                60,
                col(
                    t("What is Frequency", "label"),
                    t("The festival for people who make the future feel good to use.", "h2"),
                    t(
                        "Frequency is where 3,000 designers, engineers, and founders gather to figure out what comes next, and how to build it with taste. No keynote theatre, no vendor booths shouting over each other. Just the people quietly shaping the tools everyone else will use in three years, in one beautiful old factory by the river.",
                        "body",
                    ),
                ),
                img(pic(72), 0.92),
            ),
        ),
        section(
            "why",
            row(
                card(
                    img(pic(73), 1),
                    t("Learn the new craft", "h3"),
                    t(
                        "Forty hands-on workshops on prompt design, agent UX, and shipping AI features people actually trust.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(74), 1),
                    t("Meet your next collaborators", "h3"),
                    t(
                        "Curated dinners, hallway tracks, and a matchmaking app that puts the right five people in a room together.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(75), 1),
                    t("See it before everyone else", "h3"),
                    t(
                        "First looks at unreleased tools, live demo nights, and research that won’t be public for another year.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "lineup",
            split(
                40,
                img(pic(76), 1.05),
                col(
                    t("The lineup", "label"),
                    t("Sixty voices worth flying for.", "h2"),
                    t(
                        "Heads of design from the labs defining the field, the engineers behind the tools in your dock, and the independent makers whose side projects became everyone’s daily driver. Every talk is brand-new for Frequency. No recycled conference deck in the building.",
                        "body",
                    ),
                    button("See all speakers", "#speakers", { variant: "outline" }),
                ),
            ),
        ),
        section(
            "speakers",
            col(
                t("Speaking this year", "label"),
                t("Six of the sixty.", "h2"),
                row(
                    fill(
                        profile(
                            "Maya Okonkwo",
                            "Head of Design · Northwind",
                            "https://i.pravatar.cc/240?img=44",
                            "“Interfaces for things that think”",
                        ),
                    ),
                    fill(
                        profile(
                            "Diego Salas",
                            "Creative Technologist · Studio Mono",
                            "https://i.pravatar.cc/240?img=15",
                            "“Motion as a state machine”",
                        ),
                    ),
                    fill(
                        profile(
                            "Aisha Rahman",
                            "Founder · Halcyon Labs",
                            "https://i.pravatar.cc/240?img=47",
                            "“Shipping an agent people trust”",
                        ),
                    ),
                ),
                row(
                    fill(
                        profile(
                            "Ren Takahashi",
                            "Principal Engineer · Cedarworks",
                            "https://i.pravatar.cc/240?img=68",
                            "“Latency is a design material”",
                        ),
                    ),
                    fill(
                        profile(
                            "Nora Vance",
                            "Independent · Vanta",
                            "https://i.pravatar.cc/240?img=26",
                            "“Building quiet software”",
                        ),
                    ),
                    fill(
                        profile(
                            "Kwame Boateng",
                            "Research Lead · Field Day",
                            "https://i.pravatar.cc/240?img=53",
                            "“What users do with the undo button”",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "agenda",
            col(
                t("The agenda", "label"),
                t("Three days, three frequencies.", "h2"),
                table(
                    "Day,Morning,Afternoon,Night\nThu · Foundations,Keynote + craft talks,Hands-on workshops,Opening party on the terrace\nFri · Frontiers,Agent UX deep dives,Research showcase,Live demo night\nSat · Futures,Design fireside chats,Build-your-own labs,Closing set + dinner",
                    true,
                    1,
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "flow",
            col(
                t("How a day flows", "label"),
                t("Arrive curious, leave building.", "h2"),
                t(
                    "Every day moves the same way: a big idea in the morning, your hands on the keyboard by lunch, and something real to show by the time the lights come down.",
                    "body",
                ),
                diagram("process", "Big talk, Hands-on lab, Build, Demo + connect", 240),
            ),
        ),
        section(
            "numbers",
            row(
                stat("3,200", "makers in the room last year"),
                stat("96%", "said they’d come back"),
                stat("48", "countries on the badge list"),
            ),
            { background: bgImage(pic(77, 1700, 1100), 0.55), bleed: true },
        ),
        section(
            "praise",
            row(
                testimonial(
                    "I came with a half-finished prototype and left with three collaborators and a launch date. Frequency is the only conference I expense without asking.",
                    "Priya Raman",
                    "Product Lead, Cedarworks",
                    "https://i.pravatar.cc/240?img=32",
                ),
                testimonial(
                    "It’s the rare event where the hallway is better than the stage, and the stage was incredible.",
                    "Tom Becker",
                    "Founder, Haloway",
                    "https://i.pravatar.cc/240?img=12",
                ),
                testimonial(
                    "Three days without a single slide about digital transformation. I have been to eleven conferences this year and this is the one I would pay for myself.",
                    "Ines Duarte",
                    "Design Lead, Bright Coast",
                    "https://i.pravatar.cc/240?img=20",
                ),
            ),
        ),
        section(
            "tickets",
            col(
                t("Tickets", "label"),
                t("Pick your pass before they’re gone.", "h2"),
                pin(badge("Early bird ends Friday"), "end", "start", {
                    dx: -20,
                    dy: 8,
                    rotate: 3,
                    z: 2,
                }),
                row(
                    { align: "start" },
                    pricing(
                        "DAY PASS",
                        "€220",
                        "One day of talks",
                        [
                            "Any single day",
                            "All stage sessions",
                            "Lunch and all-day coffee",
                            "Access to the courtyard",
                        ],
                        button("Get a day pass", "#register", { variant: "outline" }),
                    ),
                    pricing(
                        "FULL FESTIVAL",
                        "€540",
                        "All three days",
                        [
                            "Every talk, all three days",
                            "Open workshop seating",
                            "Opening party and demo night",
                            "Recordings for a year",
                        ],
                        button("Get the full pass", "#register"),
                    ),
                    pricing(
                        "MAKER PASS",
                        "€780",
                        "All three days, seats reserved",
                        [
                            "Everything in Full Festival",
                            "Guaranteed workshop seats",
                            "Curated dinner on the Friday",
                            "Speaker office hours",
                        ],
                        button("Get a maker pass", "#register", { variant: "outline" }),
                    ),
                ),
                t(
                    "Teams of five or more pay €650 a head on the Maker Pass. Students and independents: write to us and we’ll sort something out.",
                    "caption",
                ),
            ),
        ),
        section(
            "sponsors",
            col(
                t("MADE POSSIBLE BY", "label", "center"),
                row(
                    { justify: "evenly", align: "center" },
                    fitW(t("NORTHWIND", "h3")),
                    fitW(t("HALCYON", "h3")),
                    fitW(t("CEDARWORKS", "h3")),
                    fitW(t("FIELD DAY", "h3")),
                    fitW(t("STUDIO MONO", "h3")),
                ),
                t("Sponsorship packs for 2027 open in January.", "caption", "center"),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "venue",
            split(
                60,
                col(
                    t("The venue", "label"),
                    t("A printworks turned playground.", "h2"),
                    t(
                        "Lx Factory is a reclaimed industrial block in Alcântara: exposed brick, river light, and a courtyard built for the conversations that happen between sessions. Lisbon airport is twenty minutes away, and partner hotels are a short tram ride down the hill.",
                        "body",
                    ),
                    button("Hotels and travel", "https://frequency.fest/travel", {
                        variant: "outline",
                    }),
                ),
                img(pic(78), 1.1),
            ),
        ),
        section(
            "faq",
            col(
                t("Good to know", "label"),
                t("The practical part.", "h2"),
                faq(
                    "collapsible",
                    [
                        [
                            "Is lunch included?",
                            "Yes. Every full-festival pass covers lunch, all-day coffee, and the opening-night party. Day passes include lunch on the day you attend.",
                        ],
                        [
                            "Can I get a refund?",
                            "Full refunds up to thirty days out, and you can transfer your pass to a colleague any time before the doors open.",
                        ],
                        [
                            "I need a visa letter.",
                            "We send an invitation letter within 48 hours of purchase. Reply to your confirmation email with the name exactly as it appears in your passport.",
                        ],
                        [
                            "Are the talks recorded?",
                            "The stage sessions are, and full-festival ticket holders keep access for a year. Workshops are never recorded, so people can be wrong out loud.",
                        ],
                        [
                            "How accessible is the venue?",
                            "Step-free throughout, with a quiet room off the courtyard and live captioning on both stages. Tell us what you need and we will arrange it.",
                        ],
                    ],
                    true,
                ),
            ),
        ),
        section(
            "register",
            col(
                t("Three days that change how you build", "label", "center"),
                t("Lisbon, October 2026. Save your seat.", "h2", "center"),
                t(
                    "Early-bird pricing ends August 1, and Maker Passes sold out in nine days last year. Don’t watch the recap. Be in the room.",
                    "subtitle",
                    "center",
                ),
                button("Get your pass", "https://frequency.fest/tickets", { size: "lg" }),
            ),
            { background: bgImage(pic(79, 1700, 1100), 0.55), bleed: true },
        ),
    ],
    bgImage(pic(80, 1700, 1100), 0.32),
);

export const waitlistPage: ArtifactContent = web(
    "noir",
    [
        section(
            "hero",
            col(
                siteNav(
                    "VANTA",
                    navLink("The idea", "#idea"),
                    navLink("First look", "#look"),
                    navLink("Timeline", "#plan"),
                    navCta("Join the waitlist", "#join"),
                ),
                t("Coming this fall", "label"),
                t("Vanta", "h1"),
                t(
                    "The workspace that disappears. One thing at a time, in perfect quiet, built to hold your attention instead of stealing it. We’re opening the first invites soon.",
                    "subtitle",
                ),
                button("Join the waitlist", "#join"),
            ),
            {
                bleed: true,
                background: bgImage(pic(81, 1700, 1100), 0.62),
                frame: { aspect: 16 / 9 },
            },
        ),
        section(
            "idea",
            split(
                60,
                col(
                    t("The idea", "label"),
                    t("Your tools should get out of the way.", "h2"),
                    t(
                        "Every app you own is fighting for your attention: notifications, tabs, the endless pull to check one more thing. Vanta does the opposite. It shows you the single piece of work in front of you and hides everything else until you’re done. No feeds, no badges, no noise. Just the quiet you forgot work could feel like.",
                        "body",
                    ),
                ),
                img(pic(82), 0.92),
            ),
        ),
        section(
            "look",
            col(
                t("First look", "label"),
                t("This is what nothing-in-your-way looks like.", "h2"),
                img(pic(83), 1.7),
            ),
        ),
        section(
            "features",
            row(
                card(
                    img(pic(84), 1),
                    t("One thing at a time", "h3"),
                    t(
                        "Pull a task into focus and the rest of the world dims. When you finish, the next thing rises on its own.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(85), 1),
                    t("Private by design", "h3"),
                    t(
                        "Everything runs on your device. Your notes, your work, your patterns. None of it leaves the machine.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(86), 1),
                    t("A quiet assistant", "h3"),
                    t(
                        "An AI that drafts, summarizes, and clears the busywork, then steps back without asking for a thing.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "deep",
            split(
                40,
                img(pic(87), 1.05),
                col(
                    t("Built for deep work", "label"),
                    badge("ON-DEVICE"),
                    t("It learns your rhythm, not your data.", "h2"),
                    t(
                        "Vanta notices when you do your best work and protects it: softening the world during your focus hours, surfacing the right task at the right moment, and leaving you completely alone when you’re in flow. All of it happens locally, on hardware you own.",
                        "body",
                    ),
                ),
            ),
            { background: bgTone("contrast"), bleed: true },
        ),
        section(
            "numbers",
            row(
                stat("31,400", "people already on the list"),
                stat("74", "countries waiting"),
                stat("Invite-only", "at launch this fall"),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "plan",
            col(
                t("The plan", "label"),
                t("Here’s when it lands.", "h2"),
                table(
                    "Phase,When,What\nPrivate beta,August 2026,The first thousand invites from the waitlist\nOpen beta,October 2026,Invites roll out in weekly batches\nLaunch,December 2026,Public release on macOS + iOS\nNext,Early 2027,Windows and a team workspace",
                ),
            ),
        ),
        section(
            "founders",
            split(
                40,
                img(pic(88), 1.05),
                testimonial(
                    "We built Vanta because we were tired of software that treats your attention as inventory to sell. This is the tool we wanted for ourselves, and the first thing in years that made our own work feel quiet again.",
                    "Eli Brandt & Nora Vance",
                    "Co-founders",
                    "https://i.pravatar.cc/240?img=26",
                ),
            ),
        ),
        section(
            "faq",
            col(
                t("Before you ask", "label"),
                t("Four things people write in about.", "h2"),
                faq(
                    "collapsible",
                    [
                        [
                            "When do I get in?",
                            "Invites go out in order, starting in August. You move up the list every time a friend joins with your link.",
                        ],
                        [
                            "What will it cost?",
                            "There’s a generous free tier, and everyone on the waitlist gets six months of Vanta Pro at launch. No card is needed to hold your place.",
                        ],
                        [
                            "Which platforms?",
                            "macOS and iOS first. Windows and a shared team workspace follow in early 2027.",
                        ],
                        [
                            "Is my work really private?",
                            "Yes. Vanta runs entirely on your device. There’s no cloud account to create, and nothing of yours is ever uploaded or sold.",
                        ],
                    ],
                    true,
                ),
            ),
        ),
        section(
            "join",
            col(
                t("Be first through the door", "label", "center"),
                t("The quiet is almost ready.", "h2", "center"),
                t(
                    "Join 31,000 people waiting for a calmer way to work. We’ll only email you twice before launch: once with your invite, once to say it’s live.",
                    "subtitle",
                    "center",
                ),
                button("Join the waitlist", "https://vanta.app/waitlist", { size: "lg" }),
            ),
            { background: bgImage(pic(89, 1700, 1100), 0.58), bleed: true },
        ),
        section(
            "footer",
            col(
                divider(),
                row(
                    { justify: "between", align: "center" },
                    fitW(t("Vanta", "h3")),
                    fitW(linked("caption", ["hello@vanta.app", "mailto:hello@vanta.app"])),
                    fitW(
                        linked("caption", ["Changelog", "https://vanta.app/changelog"], " · ", [
                            "Privacy",
                            "https://vanta.app/privacy",
                        ]),
                    ),
                ),
            ),
        ),
    ],
    bgImage(pic(90, 1700, 1100), 0.34),
);

export const agencySite: ArtifactContent = web(
    "carbon",
    [
        section(
            "hero",
            col(
                siteNav(
                    "COUNTERFORM",
                    menu(
                        "Work",
                        navLink("Meridian", "#work"),
                        navLink("Novel Press", "#more-work"),
                        navLink("Client list", "#clients"),
                        navLink("Archive on Read.cv", "https://read.cv/counterform"),
                    ),
                    navLink("Services", "#services"),
                    navLink("Approach", "#approach"),
                    navLink("Team", "#team"),
                    navCta("Start a project", "#contact"),
                ),
                t("Counterform · Brand & digital studio", "label"),
                badge("EST. 2015 · LISBON & NEW YORK"),
                t("We design brands that know how to behave.", "h1"),
                t(
                    "A small studio for ambitious companies. We build identities, products, and the systems that hold them together, so the work still looks like itself on the fortieth screen, not just the first.",
                    "subtitle",
                ),
                row(
                    { align: "center" },
                    button("Start a project", "#contact"),
                    button("See the work", "#work", { variant: "outline" }),
                ),
                pin(badge("Booking spring projects"), "end", "start", {
                    dx: -28,
                    dy: 92,
                    rotate: 3,
                    z: 2,
                }),
            ),
            {
                bleed: true,
                frame: { aspect: 16 / 7 },
                background: bgImage(pic(91, 1700, 1100), 0.55),
            },
        ),
        section(
            "services",
            col(
                t("What we do", "label"),
                t("Three practices, one studio.", "h2"),
                row(
                    { align: "start" },
                    feature(
                        "Brand",
                        "Naming, identity, voice, and the guidelines that keep it all honest as you grow. Usually where a relationship starts.",
                        "01",
                    ),
                    feature(
                        "Digital",
                        "Websites and product interfaces, designed and built by the same people, from the first sketch to shipped code.",
                        "02",
                    ),
                    feature(
                        "Systems",
                        "Design systems, motion, and the components that let your team keep moving after we have left the room.",
                        "03",
                    ),
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "work-intro",
            col(
                t("Selected work", "label"),
                t("A few things we’re proud of.", "h2"),
                t(
                    "Eleven years, a hundred-odd launches, and a stubborn belief that the details are the work. A small selection is below. The rest lives in the deck we’ll send once we’ve talked.",
                    "body",
                ),
            ),
        ),
        section(
            "work",
            row(
                card(
                    img(pic(92), 1.4),
                    t("Meridian", "h3"),
                    t("Brand & app for a challenger bank · 2025", "caption"),
                ),
                card(
                    img(pic(93), 1.4),
                    t("Orchard", "h3"),
                    t("Identity & packaging for a grocery startup · 2024", "caption"),
                ),
                card(
                    img(pic(94), 1.4),
                    t("Atlas", "h3"),
                    t("Product design for an analytics platform · 2024", "caption"),
                ),
            ),
        ),
        section("interlude", col(t("The details are the work.", "h2", "center")), {
            background: bgImage(pic(95, 1700, 1100), 0.55),
            bleed: true,
            frame: { aspect: 16 / 5 },
        }),
        section(
            "more-work",
            row(
                card(
                    img(pic(96), 1.6),
                    t("Novel Press", "h3"),
                    t("Full rebrand & site for an independent publisher · 2023", "caption"),
                ),
                card(
                    img(pic(97), 1.6),
                    t("Tidal", "h3"),
                    t("Campaign & motion system for a clean-energy launch · 2023", "caption"),
                ),
            ),
        ),
        section(
            "approach",
            col(
                t("Our approach", "label"),
                t("Four phases, no surprises.", "h2"),
                t(
                    "Every engagement runs the same clear arc, whether it’s a six-week sprint or a year-long build. You always know what we’re working on, why it matters, and what lands next.",
                    "body",
                ),
                diagram("process", "Discover, Define, Design, Build"),
                callout(
                    "note",
                    t(
                        "Most projects run 8–14 weeks. We take on six clients a year, on purpose, so yours is never the one we’re squeezing in.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "clients",
            col(
                t("Clients", "label", "center"),
                t("In good company.", "h2", "center"),
                row(
                    { justify: "evenly", align: "center" },
                    fitW(t("MERIDIAN", "h3")),
                    fitW(t("ORCHARD", "h3")),
                    fitW(t("ATLAS", "h3")),
                    fitW(t("NOVEL PRESS", "h3")),
                    fitW(t("TIDAL", "h3")),
                ),
                row(
                    { justify: "evenly", align: "center" },
                    fitW(t("HALCYON", "h3")),
                    fitW(t("CEDARWORKS", "h3")),
                    fitW(t("FIELD DAY", "h3")),
                    fitW(t("NORTHWIND", "h3")),
                    fitW(t("MARA HEALTH", "h3")),
                ),
                t(
                    "From two-person seed startups to public companies rebuilding from the logo out. The constant is people who care how the thing actually works.",
                    "caption",
                    "center",
                ),
            ),
            { background: bgTone("tint"), bleed: true },
        ),
        section(
            "numbers",
            row(
                stat("120+", "brands and products shipped"),
                stat("11 yrs", "designing in the open"),
                stat("6", "clients a year, on purpose"),
            ),
            { background: bgImage(pic(98, 1700, 1100), 0.55), bleed: true },
        ),
        section(
            "quote",
            testimonial(
                "Counterform didn’t hand us a logo and leave. They gave us a way of making decisions. A year on, we still design like they’re in the room.",
                "Dana Okoro",
                "VP Brand, Meridian",
                "https://i.pravatar.cc/240?img=41",
            ),
            { background: bgImage(pic(99, 1700, 1100), 0.6), bleed: true },
        ),
        section(
            "team",
            col(
                t("The studio", "label"),
                t("Nine people, no account managers.", "h2"),
                pin(
                    w(16, polaroid(pic(100, 900, 700), 1.3, "The studio, mostly awake.")),
                    "end",
                    "end",
                    { dx: -24, dy: 215, rotate: 4, z: 1 },
                ),
                row(
                    fill(
                        profile(
                            "Sofia Marques",
                            "Founder & Creative Director",
                            "https://i.pravatar.cc/240?img=31",
                        ),
                    ),
                    fill(
                        profile(
                            "Ravi Anand",
                            "Design Director",
                            "https://i.pravatar.cc/240?img=59",
                        ),
                    ),
                    fill(
                        profile(
                            "June Park",
                            "Engineering Lead",
                            "https://i.pravatar.cc/240?img=25",
                        ),
                    ),
                    fill(
                        profile(
                            "Tomás Ferreira",
                            "Motion & Systems",
                            "https://i.pravatar.cc/240?img=60",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "contact",
            cta(
                "Tell us what you’re building.",
                "A brand from scratch, a product that has outgrown its first look, or a system to hold a fast-growing team together. We reply to every note within two days.",
                button("hello@counterform.studio", "mailto:hello@counterform.studio", {
                    size: "lg",
                }),
            ),
            { background: bgImage(pic(101, 1700, 1100), 0.55), bleed: true },
        ),
        section(
            "footer",
            col(
                divider(),
                row(
                    { justify: "between", align: "start" },
                    fitW(
                        col(
                            fitW(t("Counterform", "h3")),
                            fitW(t("Brand & digital studio.", "caption")),
                            fitW(t("Lisbon & New York.", "caption")),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("STUDIO", "label")),
                            fitW(
                                linked(
                                    "caption",
                                    ["Work", "#work"],
                                    " · ",
                                    ["Services", "#services"],
                                    " · ",
                                    ["About", "#approach"],
                                ),
                            ),
                            fitW(
                                linked(
                                    "caption",
                                    ["Journal", "https://counterform.studio/journal"],
                                    " · ",
                                    ["Careers", "https://counterform.studio/careers"],
                                ),
                            ),
                        ),
                    ),
                    fitW(
                        col(
                            fitW(t("ELSEWHERE", "label")),
                            fitW(
                                linked(
                                    "caption",
                                    ["Instagram", "https://www.instagram.com/counterform"],
                                    " · ",
                                    ["Dribbble", "https://dribbble.com/counterform"],
                                    " · ",
                                    ["LinkedIn", "https://www.linkedin.com/company/counterform"],
                                ),
                            ),
                            fitW(
                                linked("caption", [
                                    "hello@counterform.studio",
                                    "mailto:hello@counterform.studio",
                                ]),
                            ),
                        ),
                    ),
                ),
            ),
        ),
    ],
    bgImage(pic(102, 1700, 1100), 0.3),
);

export const newsletter: ArtifactContent = doc(
    "studio",
    [
        section(
            "s1",
            group(
                t("Common Ground · Issue No. 58", "label"),
                t("Common Ground", "h1"),
                t(
                    "A fortnightly letter on cities, design, and the small things that make a place feel like home.",
                    "subtitle",
                ),
                t("Saturday, June 27, 2026 · edited by Lena Hartmann", "caption"),
            ),
            { background: bgImage(pic(103, 1700, 1100), 0.55) },
        ),
        section(
            "s2",
            group(
                t("From the editor", "label"),
                t("Good morning from the square.", "h2"),
                t(
                    "This issue nearly missed its deadline, because the street outside my window has been closed to cars for three weeks and I keep going down to sit in it. That’s the whole newsletter, really: the strange, immediate joy of a place suddenly built for people instead of through-traffic.",
                    "subtitle",
                ),
                t(
                    "So this fortnight: a street that closed for the summer, a bench worth the detour, the economics of a well-lit evening, and a postcard from Ghent. As always, hit reply. The best half of this letter is the part you write back.",
                    "body",
                ),
            ),
        ),
        section(
            "s3",
            split(
                60,
                group(
                    t("The lead", "label"),
                    t("The street that closed for the summer.", "h2"),
                    t(
                        "In May the city did something quietly radical: it closed Rua das Flores to cars, put down forty planters and a few hundred chairs, and waited to see what would happen. What happened is that the street filled up, not with programming or events, just people doing the ordinary things people do when there’s finally room for them. Children drew on the cobbles. The café tripled its tables. An old man brought a folding chair and a newspaper and held court by the fountain every morning at nine.",
                        "body",
                    ),
                    t(
                        "The merchants, who fought it, now want it made permanent. Foot traffic is up, the bakery sold out by noon three Saturdays running, and the hardware store (the one everyone was sure would suffer) reports its best quarter in a decade. It turns out a street you want to linger on is a street you also want to shop on.",
                        "body",
                    ),
                ),
                group(
                    img(pic(104), 0.78, 6),
                    t(
                        "Rua das Flores, three weeks after the cars left. The chairs were the city’s only intervention.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s4",
            split(
                40,
                group(
                    img(pic(105), 1.05, 6),
                    t(
                        "The new benches: backs, armrests, and shade, which is more than most cities manage.",
                        "caption",
                    ),
                ),
                group(
                    t("A bench worth sitting on.", "h3"),
                    t(
                        "It sounds like nothing, but most public benches are designed to be looked at, not used. They are backless, armrest-less, deliberately uncomfortable so no one stays too long. The new ones along the harbour do the radical thing of being comfortable: a real back to lean on, armrests to push up from, and a tree planted to throw shade by August. The test of a city isn’t its monuments. It’s whether an eighty-year-old can find somewhere to rest between the bus and the front door.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "s5",
            group(
                t("The 8 p.m. economy.", "h3"),
                t(
                    "A surprising line in this month’s council report: streets with warm, human-scale lighting see thirty percent more evening foot traffic than those lit by the usual orange floodlights. Counter-intuitively, they also see less crime. Light that makes a place feel watched-over rather than interrogated turns out to be the cheapest urban safety measure we have. The city is swapping two thousand fixtures this autumn. Watch the corners that used to empty at dusk.",
                    "body",
                ),
                img(pic(106), 2.2, 6),
                t(
                    "Two of the two thousand: warm lamps, and a sky that stays visible above them.",
                    "caption",
                ),
            ),
        ),
        section(
            "s6",
            split(
                60,
                group(
                    t("Field notes from Ghent.", "h3"),
                    t(
                        "I spent last weekend in Ghent, which famously banned through-traffic from its medieval centre back in 2017 and has spent the years since being smug about it, deservedly. What strikes you isn’t the absence of cars; it’s the presence of everything else. Deliveries happen by cargo bike before ten. Children ride to school alone. The air, measurably, is cleaner. It is not a museum, either. The centre is loud and ordinary and full of teenagers. The lesson Ghent keeps trying to teach the rest of us: you don’t lose a city by slowing it down. You finally get to keep it.",
                        "body",
                    ),
                ),
                group(
                    img(pic(107), 0.78, 6),
                    t(
                        "Morning deliveries in central Ghent. The cargo bike has quietly replaced the delivery van.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s7",
            quote("A street you want to linger on is a street you also want to shop on.", ""),
        ),
        section(
            "s8",
            group(
                t("From the mailbag", "label"),
                t("“Doesn’t pedestrianizing just push the traffic somewhere else?”", "h3"),
                t(
                    "It’s the first question every time, and the honest answer is: less than you’d think. The phenomenon is called traffic evaporation. When you remove road capacity, a measurable share of trips simply stop happening. People combine errands, walk the short ones, or shift the discretionary ones off the peak. Study after study finds that roughly a fifth of the displaced traffic just disappears. Cars, it turns out, are not water. They don’t have to go somewhere.",
                    "body",
                ),
            ),
        ),
        section(
            "s9",
            row(
                stat("21%", "of displaced car trips that simply evaporate"),
                stat("+38%", "weekend foot traffic on Rua das Flores"),
                stat("2,000", "streetlights the city swaps out this autumn"),
            ),
        ),
        section(
            "s10",
            group(
                t("Worth your time", "label"),
                t("Five things I saved this fortnight.", "h2"),
                bullets(
                    "“The Death and Life of Great American Streets”, a long, generous reappraisal of Jane Jacobs at sixty.",
                    "A photo essay on Tokyo’s pocket parks, the smallest of which is the size of a single parking space.",
                    "The council’s own before-and-after data on Rua das Flores (a PDF, but worth the download).",
                    "A short film on Pontevedra, the Spanish town that banned cars and forgot what a traffic jam feels like.",
                    "My friend Cira’s newsletter on trees in cities, which is better than this one and you should read it too.",
                ),
            ),
        ),
        section(
            "s11",
            group(
                divider(),
                t(
                    "That’s the fortnight. I’ll be in the square if you need me, third chair from the fountain, the one with the newspaper. Until the next one, Lena.",
                    "subtitle",
                ),
            ),
        ),
        section(
            "s12",
            group(
                divider(),
                t(
                    "Common Ground is written every other Saturday by Lena Hartmann, a writer and former city planner in Lisbon. Forwarded this? Subscribe at commonground.letter. Reply to anything. It all reaches me.",
                    "caption",
                ),
            ),
        ),
    ],
    bgImage("https://images.pexels.com/photos/5993568/pexels-photo-5993568.jpeg", 0.26),
);

export const startupPitch: ArtifactContent = deck(
    "noir",
    [
        section(
            "s1",
            group(
                t("MISE · SEED ROUND 2026", "label"),
                t("Run the kitchen, not the spreadsheet.", "h1"),
                t(
                    "Mise turns every restaurant's POS, invoices, and suppliers into one live system: forecasting prep, automating orders, and clawing back the margin that waste quietly eats.",
                    "subtitle",
                ),
                badge("$4M SEED · LED BY ANDISON CAPITAL"),
            ),
            { background: bgImage(pic(108, 1700, 1100), 0.55) },
        ),
        section(
            "s2",
            split(
                60,
                group(
                    t("01 · The problem", "label"),
                    t("Restaurants run on 4% margins and 1990s tooling.", "h2"),
                    t(
                        "The average independent restaurant throws away 8% of everything it buys, orders by gut feel at 11pm, and learns it lost money a month too late. The back of house is the last part of the business still run on clipboards and group texts.",
                        "body",
                    ),
                ),
                img(pic(109), 0.82),
            ),
        ),
        section(
            "s3",
            quote(
                "Front of house got Toast, Square, and Resy. The kitchen, where the money is actually made or lost, got nothing.",
                "The Mise thesis",
            ),
            { background: bgImage(pic(110, 1700, 1100), 0.6) },
        ),
        section(
            "s4",
            split(
                40,
                img(pic(111), 1.1),
                group(
                    t("02 · Why now", "label"),
                    t("The kitchen's data finally left the building.", "h2"),
                    bullets(
                        "Cloud POS (Toast, Square) now expose item-level sales over API: the demand signal didn't exist five years ago",
                        "Distributors like US Foods and Sysco shipped ordering APIs in 2024",
                        "Forecasting that used to need a data team now runs as one model per location",
                    ),
                ),
            ),
        ),
        section(
            "s5",
            split(
                40,
                img(pic(112), 1.1),
                group(
                    t("03 · The product", "label"),
                    t("One screen the whole line actually opens.", "h2"),
                    bullets(
                        "Prep lists that predict tomorrow from last year, the weather, and tonight's reservations",
                        "Orders that draft themselves to par and send with one tap",
                        "Live food cost: by dish, by station, by shift",
                    ),
                ),
            ),
        ),
        section(
            "s6",
            row(
                stat("$1.1T", "U.S. restaurant industry"),
                stat("749K", "U.S. restaurant locations"),
                stat("$162B", "food wasted by U.S. restaurants / yr"),
            ),
        ),
        section(
            "s7",
            group(
                t("04 · How it works", "label"),
                t("Connect once. It runs every morning.", "h2"),
                diagram(
                    "process",
                    "Connect POS & invoices, Mise learns your menu, Forecast tonight's covers, Auto-draft the order, Lock in food cost",
                    180,
                ),
            ),
        ),
        section(
            "s8",
            split(
                60,
                group(
                    t("05 · Traction", "label"),
                    row(
                        { align: "baseline", gap: 10 },
                        fitW(t("38", "h1")),
                        t("kitchens that don't want to give it back.", "h2"),
                    ),
                    t(
                        "Live in 38 kitchens across 6 restaurant groups, with $2.1M in food orders run through Mise this quarter. Pilots cut food cost by an average of 310 basis points within 60 days.",
                        "body",
                    ),
                    callout(
                        "success",
                        t(
                            "112% net revenue retention: groups add locations faster than we can onboard them.",
                            "body",
                        ),
                    ),
                ),
                chart("line", "6, 11, 17, 24, 31, 38", 240),
            ),
        ),
        section(
            "s9",
            row(
                stat("38", "kitchens live"),
                stat("310bps", "avg food-cost reduction"),
                stat("94%", "weekly active kitchens"),
            ),
        ),
        section(
            "s10",
            group(
                t("06 · Business model", "label"),
                t("Per-location SaaS, priced under the waste it kills.", "h2"),
                table(
                    "Plan,Per location / mo,Built for\nLine,$249,Single independents\nKitchen,$399,Full-service & multi-station\nGroup,$329,Multi-unit groups (5+)\nEnterprise,Custom,Chains & franchisors",
                ),
            ),
        ),
        section(
            "s11",
            split(
                60,
                group(
                    t("07 · Why we win", "label"),
                    t("What we are up against, and why it loses.", "h2"),
                    bullets(
                        "Distributor portals (Sysco, US Foods) want you to buy more, not waste less",
                        "Inventory apps count what's already gone; Mise predicts what's next",
                        "We're POS-agnostic: the data layer for the kitchen, not another silo",
                    ),
                ),
                img(pic(113), 0.86),
            ),
        ),
        section(
            "s12",
            row(
                group(
                    img(pic(114), 1),
                    t("Dana Reyes", "h3"),
                    t("CEO · ex-Toast, ran ops for 40 kitchens", "caption"),
                ),
                group(
                    img(pic(115), 1),
                    t("Marcus Vallée", "h3"),
                    t("CTO · ex-Flexport forecasting", "caption"),
                ),
                group(
                    img(pic(116), 1),
                    t("Priya Anand", "h3"),
                    t("Head of Culinary · 12 years on the line", "caption"),
                ),
            ),
        ),
        section(
            "s13",
            split(
                40,
                img(pic(117), 0.86),
                group(
                    t("08 · The ask", "label"),
                    t("Raising $4M to put Mise in 1,000 kitchens.", "h2"),
                    t(
                        "Use of funds: supplier API coverage (40%), the forecasting & food-cost engine (35%), and a culinary-led go-to-market across the top 20 U.S. metros (25%). 24 months of runway to $4M ARR.",
                        "body",
                    ),
                    button("dana@mise.kitchen"),
                ),
            ),
            { background: bgImage(pic(118, 1700, 1100), 0.6) },
        ),
    ],
    bgImage(pic(119, 1700, 1100), 0.35),
);

export const salesDeck: ArtifactContent = deck(
    "carbon",
    [
        section(
            "f1",
            group(
                t("FLEETWISE · FOR OPERATIONS & MAINTENANCE LEADERS", "label"),
                t("Your trucks make money moving, not in the shop.", "h1"),
                t(
                    "Fleetwise reads the telematics you already pay for and turns it into maintenance you do before the breakdown, cutting unplanned downtime, roadside failures, and the overtime that follows.",
                    "subtitle",
                ),
                badge("TRUSTED BY 140+ FLEETS"),
            ),
            { background: bgImage(pic(120, 1700, 1100), 0.55) },
        ),
        section(
            "f2",
            split(
                60,
                group(
                    t("The problem", "label"),
                    t("Every breakdown is a fire you find out about by phone.", "h2"),
                    t(
                        "Maintenance is still scheduled by odometer and gut. A water pump telematics flagged three weeks ago strands a driver on I-80 at 2am. Now it's a tow, a missed delivery, a hotel, and a tech on overtime. The signal to prevent it was already in the truck.",
                        "body",
                    ),
                ),
                img(pic(121), 0.82),
            ),
        ),
        section(
            "f3",
            row(
                stat("$760", "avg cost per truck, per day down"),
                stat("23%", "of road calls were preventable"),
                stat("4.3 days", "avg unplanned repair turnaround"),
            ),
        ),
        section(
            "f4",
            split(
                40,
                img(pic(122), 1.1),
                group(
                    t("The solution", "label"),
                    t("Fix it in the bay, on your schedule.", "h2"),
                    bullets(
                        "Predicts component failures 2–6 weeks out from the telematics you already run",
                        "Auto-builds the work order with parts, labor, and the best open bay window",
                        "One health score per truck: green, watch, or ground it",
                    ),
                ),
            ),
        ),
        section(
            "f5",
            group(
                t("How it works", "label"),
                t("Live in two weeks, no new hardware.", "h2"),
                diagram(
                    "process",
                    "Connect your telematics, Fleetwise scores every vehicle, Flags failures weeks early, Drafts the work order, Schedule before it breaks",
                    180,
                ),
            ),
        ),
        section(
            "f6",
            split(
                60,
                group(
                    t("Case study · Meridian Freight", "label"),
                    t("A 320-truck carrier got its shop ahead of the road.", "h2"),
                    t(
                        "Meridian ran 18% unplanned downtime and a purely reactive shop. Twelve months on Fleetwise, planned maintenance went from 41% to 78% of all work, and roadside failures fell by more than half.",
                        "body",
                    ),
                    callout(
                        "success",
                        t("$1.9M saved in year one, 11× their Fleetwise spend.", "body"),
                    ),
                ),
                chart("line", "18, 16, 14, 11, 9, 8, 8", 240),
            ),
        ),
        section(
            "f7",
            row(
                stat("52%", "fewer roadside failures"),
                stat("78%", "of work now planned"),
                stat("11×", "first-year ROI"),
            ),
        ),
        section(
            "f8",
            quote(
                "We used to staff for breakdowns. Now we staff for the schedule Fleetwise hands us the night before.",
                "Carla Mendez, VP Maintenance, Meridian Freight",
            ),
            { background: bgImage(pic(123, 1700, 1100), 0.6) },
        ),
        section(
            "f9",
            group(
                t("Pricing", "label"),
                t("Priced per truck, under one day of downtime.", "h2"),
                table(
                    "Plan,Per truck / mo,Includes\nCore,$29,Health scores & failure alerts\nShop,$39,+ Auto work orders & parts\nFleet,$34,Multi-depot · 100+ trucks\nEnterprise,Custom,Telematics integrations & SLA",
                ),
            ),
        ),
        section(
            "f10",
            split(
                60,
                group(
                    t("Why now", "label"),
                    t("Margins are thin and parts lead times aren't shrinking.", "h2"),
                    t(
                        "Freight rates are soft, labor is tight, and a backordered part can ground a truck for a week. The fleets pulling ahead stopped reacting. Predictive maintenance is now table stakes, and your telematics already carries the signal.",
                        "body",
                    ),
                ),
                img(pic(124), 0.86),
            ),
        ),
        section(
            "f11",
            split(
                40,
                img(pic(125), 0.86),
                group(
                    t("Next steps", "label"),
                    t("See your own fleet's risk in 30 minutes.", "h2"),
                    t(
                        "Send us read-only telematics access and we'll bring a free risk assessment of your top 25 vehicles to the next call: no install, no commitment.",
                        "body",
                    ),
                    button("Book your fleet assessment"),
                ),
            ),
            { background: bgImage(pic(126, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(127, 1700, 1100), 0.35),
);

export const seriesA: ArtifactContent = deck(
    "obsidian",
    [
        section(
            "a1",
            group(
                t("SWITCHBOARD · SERIES A · 2026", "label"),
                t("Never miss the call that pays the bills.", "h1"),
                t(
                    "Switchboard is the AI front desk for home-services businesses, answering every call and text in seconds, booking the job, and keeping the schedule full, around the clock.",
                    "subtitle",
                ),
                badge("$18M SERIES A · LED BY MERIDIAN VENTURES"),
            ),
            { background: bgImage(pic(128, 1700, 1100), 0.55) },
        ),
        section(
            "a2",
            split(
                60,
                group(
                    t("01 · Why now", "label"),
                    t("Voice AI finally crossed the line a caller can't hear.", "h2"),
                    t(
                        "The trades still run on the phone, and owners on a roof or under a sink miss roughly one call in four. Until 2024, an AI that answered was obviously a robot. Today Switchboard books the job, and the customer never knows they weren't talking to the front desk.",
                        "body",
                    ),
                ),
                img(pic(129), 0.82),
            ),
        ),
        section(
            "a3",
            quote(
                "Every missed call is a job that went to the next plumber on Google. We just pick up.",
                "The Switchboard thesis",
            ),
            { background: bgImage(pic(130, 1700, 1100), 0.6) },
        ),
        section(
            "a4",
            row(
                stat("2,400", "businesses on Switchboard"),
                stat("$6.8M", "ARR · up 3.1× YoY"),
                stat("$140M", "in jobs booked for customers"),
            ),
        ),
        section(
            "a5",
            split(
                60,
                group(
                    t("02 · What we've proven", "label"),
                    t("Revenue that compounds with every booked job.", "h2"),
                    t(
                        "Live across 2,400 contractors in 38 states, Switchboard answered 1.9 million calls last quarter and turned a third of them into booked work. Owners don't churn. They add their second location and switch on texting and scheduling on their own.",
                        "body",
                    ),
                    callout(
                        "success",
                        t(
                            "132% net revenue retention: accounts grow faster than we can sell to them.",
                            "body",
                        ),
                    ),
                ),
                chart("line", "0.4, 0.9, 1.8, 3.1, 4.9, 6.8", 240),
            ),
        ),
        section(
            "a6",
            split(
                40,
                img(pic(131), 1.1),
                group(
                    t("03 · The product", "label"),
                    t("One front desk that never sleeps.", "h2"),
                    bullets(
                        "Answers every call and text in under two seconds, in English or Spanish",
                        "Books the job straight into the calendar, with address, photos, and the right crew",
                        "Texts the customer a confirmation, a reminder, and a review request",
                        "Hands off to a human the moment it should, with the full call summary",
                    ),
                ),
            ),
        ),
        section(
            "a7",
            split(
                60,
                group(
                    t("04 · The wedge", "label"),
                    t("We land on the call they're already losing.", "h2"),
                    t(
                        "Switchboard starts with after-hours and overflow calls: the clearest ROI in the business and nothing to rip out. Once an owner sees jobs booked while they slept, we expand into texting, scheduling, follow-ups, and payments, until we're the whole front office.",
                        "body",
                    ),
                ),
                img(pic(132), 0.82),
            ),
        ),
        section(
            "a8",
            group(
                t("05 · Go-to-market", "label"),
                t("A self-serve funnel with a field-sales motor.", "h2"),
                diagram(
                    "process",
                    "Owner signs up online, Number ports in minutes, Books the first job same day, Switches on text & scheduling, Refers their trade network",
                    180,
                ),
            ),
        ),
        section(
            "a9",
            group(
                t("06 · Unit economics", "label"),
                t("Payback under three months, and still improving.", "h2"),
                table(
                    "Metric,Today,Series B target\nAverage revenue / account,$236 / mo,$340 / mo\nGross margin,79%,84%\nCAC payback,2.8 months,2.0 months\nNet revenue retention,132%,140%\nAnnual logo churn,9%,6%",
                ),
            ),
        ),
        section(
            "a10",
            row(
                group(
                    img(pic(133), 1),
                    t("Dana Whitfield", "h3"),
                    t("CEO · ex-ServiceTitan, scaled 3,000 contractors", "caption"),
                ),
                group(
                    img(pic(134), 1),
                    t("Amir Hassan", "h3"),
                    t("CTO · ex-Google speech, built real-time voice", "caption"),
                ),
                group(
                    img(pic(135), 1),
                    t("Lena Ortiz", "h3"),
                    t("Head of Revenue · ex-Jobber, 0→$30M", "caption"),
                ),
            ),
        ),
        section(
            "a11",
            row(
                group(
                    t("07 · The raise", "label"),
                    t("Raising $18M to reach 10,000 businesses.", "h2"),
                    t(
                        "Use of funds: deepen the voice and scheduling product (40%), build a category-leading field and partner sales motion (35%), and expand into the next five trades (25%). 24 months of runway to $25M ARR.",
                        "body",
                    ),
                    button("dana@switchboard.ai"),
                ),
                group(
                    t("Milestones", "label"),
                    bullets(
                        "Q3 · Spanish-first voice and SMS go GA",
                        "Q4 · 5,000 businesses, $12M ARR",
                        "Q2 '27 · Payments & invoicing live",
                        "Q4 '27 · 10,000 businesses, $25M ARR",
                    ),
                ),
            ),
        ),
        section(
            "a12",
            group(
                t("08 · Vision", "label"),
                t("The operating system for the businesses that show up at your door.", "h1"),
                t(
                    "Eight million tradespeople run the physical economy off a phone and a paper calendar. Switchboard starts by answering the call, and ends up running the whole business behind it.",
                    "subtitle",
                ),
            ),
            { background: bgImage(pic(136, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(137, 1700, 1100), 0.35),
);

export const productDemo: ArtifactContent = deck(
    "telegraph",
    [
        section(
            "p1",
            group(
                t("SIFT · PRODUCT TOUR", "label"),
                t("Turn every customer signal into your next release.", "h1"),
                t(
                    "Sift pulls feedback from support tickets, sales calls, reviews, and surveys into one place, then tells your product team what to build next, and exactly who asked for it.",
                    "subtitle",
                ),
                badge("A FIVE-MINUTE TOUR"),
            ),
            { background: bgImage(pic(138, 1700, 1100), 0.55) },
        ),
        section(
            "p2",
            row(
                group(
                    t("Who it's for", "label"),
                    t("Built for the people who own the roadmap.", "h2"),
                    t(
                        "Product managers, support leaders, and founders at growing B2B software companies: anyone who has to decide what's worth building when every customer is asking for something different.",
                        "body",
                    ),
                ),
                img(pic(139), 1.0),
            ),
        ),
        section(
            "p3",
            split(
                40,
                img(pic(140), 1.1),
                group(
                    t("Before Sift", "label"),
                    t("Feedback lives everywhere. Decisions live on a hunch.", "h2"),
                    bullets(
                        "Requests scattered across Zendesk, Slack, Gong, and a spreadsheet nobody updates",
                        "The loudest customer wins, not the most important one",
                        "No way to prove what's actually driving churn or expansion",
                    ),
                    callout(
                        "warn",
                        t(
                            "The average team burns a full day a week just collating feedback, before a single decision gets made.",
                            "body",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "p4",
            split(
                40,
                img(pic(141), 1.1),
                group(
                    t("The tour · 01", "label"),
                    t("Every signal lands in one inbox.", "h2"),
                    bullets(
                        "Connect your tools once: Sift streams in tickets, calls, reviews, and survey replies automatically",
                        "Each item carries the account, plan, and revenue it came from",
                        "Nothing to forward, tag, or copy-paste ever again",
                    ),
                ),
            ),
        ),
        section(
            "p5",
            split(
                60,
                group(
                    t("The tour · 02", "label"),
                    t("Sift reads it so your team doesn't have to.", "h2"),
                    bullets(
                        "Every piece of feedback is summarized, sentiment-scored, and sorted into themes automatically",
                        "Duplicate requests merge into one, with a running count and the revenue behind them",
                        'Ask in plain English ("what are enterprise accounts frustrated by?") and get the answer with receipts',
                    ),
                ),
                img(pic(142), 0.82),
            ),
        ),
        section(
            "p6",
            split(
                40,
                img(pic(143), 1.1),
                group(
                    t("The tour · 03", "label"),
                    t("Watch the themes that matter move week over week.", "h2"),
                    bullets(
                        "Top themes ranked by reach, revenue at risk, and momentum",
                        "Filter to any segment: plan, region, ARR band, or lifecycle stage",
                        "Spot a spike the day it starts, not in next quarter's QBR",
                    ),
                ),
            ),
        ),
        section(
            "p7",
            split(
                60,
                group(
                    t("The tour · 04", "label"),
                    t("Close the loop without leaving Sift.", "h2"),
                    bullets(
                        "Turn a theme into a roadmap item and push it to Jira or Linear in a click",
                        "When it ships, Sift messages every customer who asked",
                        "Reopen rates drop and renewal calls get a lot friendlier",
                    ),
                ),
                img(pic(144), 0.82),
            ),
        ),
        section(
            "p8",
            row(
                stat("9 hrs", "saved per PM, every week"),
                stat("3.4×", "more feedback reviewed"),
                stat("28%", "faster from request to release"),
            ),
        ),
        section(
            "p9",
            quote(
                "We stopped arguing about the roadmap in meetings. Now we just open Sift and the answer's already there.",
                "Priya Nair, VP Product, Northwind Software",
            ),
            { background: bgImage(pic(145, 1700, 1100), 0.6) },
        ),
        section(
            "p10",
            row(
                card(t("Support", "h3"), t("Zendesk · Intercom · Front · Help Scout", "body")),
                card(t("Sales & calls", "h3"), t("Gong · Salesforce · HubSpot · Slack", "body")),
                card(
                    t("Voice of customer", "h3"),
                    t("G2 · App Store · Typeform · NPS surveys", "body"),
                ),
            ),
        ),
        section(
            "p11",
            group(
                t("Pricing", "label"),
                t("Starts free. Scales with your team, not your ticket volume.", "h2"),
                table(
                    "Plan,Price,Built for\nFree,$0,Up to 1k feedback items / mo\nTeam,$99 / mo,Growing product teams\nBusiness,$399 / mo,Multiple products & segments\nEnterprise,Custom,SSO · security review · SLAs",
                ),
            ),
        ),
        section(
            "p12",
            group(
                t("Get started", "label"),
                t("Stop guessing. Start shipping what customers actually asked for.", "h1"),
                t(
                    "Connect your first source in under ten minutes. Free for your first 1,000 pieces of feedback, no credit card.",
                    "subtitle",
                ),
                button("Start free"),
            ),
            { background: bgImage(pic(146, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(147, 1700, 1100), 0.35),
);

export const companyOverview: ArtifactContent = deck(
    "couture",
    [
        section(
            "c1",
            group(
                t("FERNWOOD & CO.", "label"),
                t("Furniture made to outlast the trend that inspired it.", "h1"),
                t(
                    "We are a Portland design studio and workshop making contemporary furniture, lighting, and objects: drawn by hand, built by people, and meant to be handed down.",
                    "subtitle",
                ),
                badge("EST. 2012 · PORTLAND, OREGON"),
            ),
            { background: bgImage(pic(148, 1700, 1100), 0.55) },
        ),

        section(
            "c2",
            split(
                60,
                group(
                    t("WHAT WE DO", "label"),
                    t(
                        "We design and build furniture for the spaces people actually live in.",
                        "h2",
                    ),
                    t(
                        "From a single dining table to the seating for a 200-room hotel, every Fernwood piece is designed in-house and made to order in our Southeast Portland workshop. No middlemen, no warehouse of the same chair. Just considered work, built to last.",
                        "body",
                    ),
                ),
                img(pic(149), 0.82),
            ),
        ),

        section(
            "c3",
            split(
                40,
                img(pic(150), 1.05),
                group(
                    t("OUR STORY", "label"),
                    t("It started with one stubborn bench.", "h2"),
                    t(
                        "In 2012, Mara and Elias Fernwood couldn't find a bench that would survive their kids, so they built one. Friends asked for theirs. A decade later, that same joinery holds up every piece we ship, now from a 12,000-square-foot workshop and a team of thirty makers.",
                        "body",
                    ),
                ),
            ),
        ),

        section(
            "c4",
            row(
                card(
                    img(pic(151), 1.4),
                    t("Seating", "h3"),
                    t(
                        "Chairs, benches, and sofas with frames that are screwed rather than stapled, and reupholstered rather than replaced.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(152), 1.4),
                    t("Tables & casegoods", "h3"),
                    t(
                        "Dining tables, desks, and storage in solid oak, walnut, and ash, finished by hand.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(153), 1.4),
                    t("Lighting", "h3"),
                    t(
                        "Pendants, sconces, and floor lamps in turned wood, blown glass, and brushed brass.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "c5",
            group(
                t("OUR CRAFT", "label"),
                t("Real materials, joined to last a generation.", "h2"),
                t(
                    "We work only in FSC-certified hardwoods, water-based finishes, and solid brass hardware. Nothing veneered, nothing disposable. Each joint is cut to fit, each surface sanded through nine grits, and each piece signed by the maker who built it.",
                    "body",
                ),
                button("Tour the workshop"),
            ),
            { background: bgImage(pic(154, 1700, 1100), 0.6) },
        ),

        section(
            "c6",
            split(
                60,
                group(
                    t("WHO WE SERVE", "label"),
                    t("Trusted by the people who care how a room feels.", "h2"),
                    t(
                        "Half our work is bespoke commissions for interior designers and architects; the rest furnishes hotels, restaurants, and workplaces that want pieces no one else will have.",
                        "body",
                    ),
                    bullets(
                        "Interior designers & architects · a trade program with to-the-trade pricing",
                        "Hospitality · hotels, restaurants, and members' clubs",
                        "Workplace · studios and offices that have outgrown the catalog",
                        "Private clients · heirloom commissions, made to measure",
                    ),
                    t(
                        "Selected clients · The Hoxton · Roman and Williams · Studio McGee · Ace Hotel",
                        "caption",
                    ),
                ),
                img(pic(155), 0.82),
            ),
        ),

        section(
            "c7",
            row(
                quote(
                    "Fernwood is the only shop I trust with a lobby. The pieces arrive better than the drawings, every time.",
                    "Dahlia Reyes · Principal, Reyes + Co. Interiors",
                ),
                quote(
                    "Five years and forty covers a night, and our Fernwood chairs haven't loosened a single joint.",
                    "Marco Bélanger · Owner, Cafe Mistral",
                ),
            ),
        ),

        section(
            "c8",
            row(
                stat("8,400", "pieces built and shipped since 2012"),
                stat("30", "makers, finishers, and designers on the bench"),
                stat("25 yrs", "structural warranty on every frame"),
            ),
        ),

        section(
            "c9",
            split(
                60,
                group(
                    t("HOW WE WORK", "label"),
                    t("From sketch to your room in four steps.", "h2"),
                    t(
                        "Every commission moves through the same calm process, so you always know where your piece is and who is building it.",
                        "body",
                    ),
                    diagram(
                        "process",
                        "Design & quote, Hand-cut joinery, Finish & sign, White-glove delivery",
                        180,
                    ),
                ),
                img(pic(156), 0.9),
            ),
        ),

        section(
            "c10",
            row(
                group(
                    img(pic(157), 1),
                    t("Mara Fernwood", "h3"),
                    t("Founder & Creative Director", "caption"),
                ),
                group(
                    img(pic(158), 1),
                    t("Elias Fernwood", "h3"),
                    t("Founder & Head of Workshop", "caption"),
                ),
                group(
                    img(pic(159), 1),
                    t("Jun Park", "h3"),
                    t("Design Lead · ex-Heath Ceramics", "caption"),
                ),
            ),
        ),

        section(
            "c11",
            split(
                40,
                img(pic(160), 1.05),
                group(
                    t("WHAT WE BELIEVE", "label"),
                    t("Make less. Make it last.", "h2"),
                    bullets(
                        "Repairable by design · we keep the parts and plans for everything we ship",
                        "Local first · we mill, build, and finish under one Portland roof",
                        "Fair work · a living wage and a real bench for every maker",
                        "Honest materials · solid wood and metal, or we don't use it",
                    ),
                    callout(
                        "success",
                        t(
                            "Carbon-measured since 2021: every piece ships climate-neutral, and our offcuts heat the shop.",
                            "body",
                        ),
                    ),
                ),
            ),
        ),

        section(
            "c12",
            group(
                t("GET IN TOUCH", "label"),
                t("Let's build something that lasts.", "h1"),
                t(
                    "Visit the workshop, start a commission, or join the trade program. We'd love to make something for your space.",
                    "subtitle",
                ),
                button("hello@fernwoodco.com"),
            ),
            { background: bgImage(pic(161, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(162, 1700, 1100), 0.34),
);

export const gtmPlan: ArtifactContent = deck(
    "cement",
    [
        section(
            "g1",
            group(
                t("TIDEPOOL · GO-TO-MARKET PLAN", "label"),
                t("Launching the inventory brain for growing brands.", "h1"),
                t(
                    "Our plan to take Tidepool (demand planning and inventory for multi-channel retail) from private beta to 1,000 paying brands in twelve months.",
                    "subtitle",
                ),
                badge("GO-TO-MARKET PLAN · H2 2026"),
            ),
            { background: bgImage(pic(163, 1700, 1100), 0.55) },
        ),

        section(
            "g2",
            split(
                60,
                group(
                    t("THE OPPORTUNITY", "label"),
                    t("Growing brands are flying blind on inventory.", "h2"),
                    t(
                        "Once a brand sells across a website, three marketplaces, and a few wholesale accounts, spreadsheets stop working. Stockouts and overstock quietly eat the margin. The tools that solve it are built for the enterprise and priced out of reach. That gap is ours.",
                        "body",
                    ),
                ),
                group(
                    chart("column", "12, 19, 31, 48, 72, 104", 240),
                    t(
                        "US mid-market brands adopting inventory software, 2021–2026 (thousands)",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "g3",
            row(
                card(
                    img(pic(164), 1.4),
                    t("DTC brands", "h3"),
                    t(
                        "$2M–$30M online sellers on Shopify juggling Amazon, TikTok Shop, and their own site.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(165), 1.4),
                    t("Multi-location retail", "h3"),
                    t(
                        "3–20 store chains that need one source of truth across the floor and the stockroom.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(166), 1.4),
                    t("Wholesale & distribution", "h3"),
                    t(
                        "Brands shipping to stockists who need to promise dates they can actually keep.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "g4",
            group(
                t("POSITIONING", "label"),
                t("The demand-planning brain built for brands, not the enterprise.", "h2"),
                t(
                    "For operators at growing multi-channel brands who are tired of guessing, Tidepool is the inventory platform that forecasts demand, flags stockouts before they happen, and tells you exactly what to reorder, without an ERP project or a six-figure contract.",
                    "body",
                ),
                callout(
                    "info",
                    t(
                        "Where the big platforms need a consultant and six months, Tidepool is live in an afternoon and pays for itself the first time it prevents a stockout.",
                        "body",
                    ),
                ),
            ),
            { background: bgImage(pic(167, 1700, 1100), 0.55) },
        ),

        section(
            "g5",
            split(
                40,
                img(pic(168), 1.05),
                group(
                    t("THE FUNNEL", "label"),
                    t("How a curious operator becomes a paying brand.", "h2"),
                    t(
                        "We earn trust at the top with genuinely useful content, convert with a free plan that solves a real problem, and expand as a brand connects more channels.",
                        "body",
                    ),
                    diagram(
                        "funnel",
                        "Discover via search & community, Free plan sign-up, Connect a channel, Convert to paid, Expand",
                        220,
                    ),
                ),
            ),
        ),

        section(
            "g6",
            row(
                card(
                    img(pic(169), 1.4),
                    t("Content & SEO", "h3"),
                    t(
                        "Operator-grade guides on demand planning that rank for the problems brands Google at 11pm.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(170), 1.4),
                    t("Platform partnerships", "h3"),
                    t(
                        "A featured Shopify app and co-marketing with 3PLs and agencies who already have the trust.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(171), 1.4),
                    t("Community & events", "h3"),
                    t(
                        "Founder dinners and an operators' Slack where our best customers sell the next ones.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "g7",
            group(
                t("PRICING & PACKAGING", "label"),
                t("Priced to land self-serve and grow with the brand.", "h2"),
                table(
                    "Plan,Price,Built for,Key limits\nFree,$0,Single-channel sellers,1 channel · 500 SKUs · 90-day forecast\nGrowth,$149 / mo,Multi-channel DTC,Unlimited channels · 5k SKUs · reorder alerts\nPro,$399 / mo,Scaling & wholesale,Demand planning · POs · 3 seats\nEnterprise,Custom,Multi-entity brands,SSO · API · onboarding & SLAs",
                ),
                t(
                    "Land on Free or Growth self-serve, convert to Pro as channels and SKUs grow, Enterprise for multi-entity brands.",
                    "caption",
                ),
            ),
        ),

        section(
            "g8",
            group(
                t("LAUNCH TIMELINE", "label"),
                t("Four phases from beta to GA.", "h2"),
                diagram(
                    "process",
                    "Private beta · 40 brands, Open beta · pricing live, Public launch · Shopify feature, Scale · paid channels on",
                    180,
                ),
            ),
        ),

        section(
            "g9",
            row(
                stat("1,000", "paying brands by Q2 '27"),
                stat("$3.6M", "ARR target in the first year"),
                stat("< 4 mo", "CAC payback, blended across channels"),
            ),
        ),

        section(
            "g10",
            row(
                group(
                    t("FIRST 90 DAYS", "label"),
                    t("What we ship before launch.", "h2"),
                    bullets(
                        "Weeks 1–4 · Finalize Free/Growth packaging and the self-serve onboarding",
                        "Weeks 5–8 · Ship the Shopify app listing and three cornerstone guides",
                        "Weeks 9–12 · Open beta to the waitlist and stand up the operators' community",
                    ),
                ),
                group(
                    t("OWNERS", "label"),
                    t("Who's accountable", "h3"),
                    table(
                        "Workstream,Owner\nProduct & onboarding,Priya Anand\nContent & SEO,Tomas Lindqvist\nPartnerships,Renee Okoro\nCommunity & events,Dario Vella",
                    ),
                ),
            ),
        ),

        section(
            "g11",
            group(
                t("NEXT STEPS", "label"),
                t("Greenlight the launch.", "h1"),
                t(
                    "Approve the plan and the H2 budget this week, and Tidepool ships to the waitlist on September 15.",
                    "subtitle",
                ),
                button("Approve & kick off"),
            ),
            { background: bgImage(pic(172, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(173, 1700, 1100), 0.34),
);

export const projectProposal: ArtifactContent = deck(
    "studio",
    [
        section(
            "cover",
            group(
                t("PROPOSAL · PREPARED FOR ATLAS COFFEE ROASTERS", "label"),
                t("A rebrand worth waking up for.", "h1"),
                t(
                    "Foldwork (a brand & digital studio) on relaunching Atlas as a specialty-coffee name that travels. Prepared for the Atlas leadership team, June 2026.",
                    "subtitle",
                ),
                badge("CONFIDENTIAL · v2"),
            ),
            { background: bgImage(pic(174, 1700, 1100), 0.55) },
        ),
        section(
            "opportunity",
            split(
                60,
                group(
                    t("01 · The opportunity", "label"),
                    t("Great coffee, hiding behind a tired bag.", "h2"),
                    t(
                        "Atlas has roasted exceptional coffee since 2014 and earned a loyal following across 60 wholesale cafes. But the brand hasn’t kept up with the cup. The packaging reads local-craft-2014, the site converts below category benchmarks, and the look fractures at every touchpoint. Meanwhile specialty-coffee DTC is growing 23% a year, and the shelf has never been more crowded.",
                        "body",
                    ),
                ),
                img(pic(175), 0.82),
            ),
        ),
        section(
            "goals",
            group(
                t("02 · What we heard", "label"),
                t("Where you want to be in twelve months.", "h2"),
                bullets(
                    "Triple direct-to-consumer revenue within twelve months",
                    "Launch a coffee subscription with predictable recurring revenue",
                    "Look like a national brand without losing the neighborhood story",
                    "Win shelf space in regional grocery and specialty retail",
                    "Unify the look across the bag, the web, and the cafe counter",
                ),
            ),
        ),
        section(
            "northstar",
            quote(
                "We don’t want to look bigger. We want to look like the best version of ourselves.",
                "Dana Mercer · Founder, Atlas Coffee Roasters",
            ),
            { background: bgImage(pic(176, 1700, 1100), 0.6) },
        ),
        section(
            "approach",
            split(
                40,
                img(pic(177), 1.05),
                group(
                    t("03 · Our approach", "label"),
                    t("Strategy first. Then a system, not a logo.", "h2"),
                    bullets(
                        "Roast notes, not buzzwords: language that actually sounds like you",
                        "A flexible identity that scales from one bag to a grocery shelf",
                        "Designed for the shelf and the screen at the same time",
                    ),
                ),
            ),
        ),
        section(
            "deliverables",
            row(
                card(
                    t("Brand Strategy", "h3"),
                    bullets(
                        "Positioning & messaging platform",
                        "Naming & voice guidelines",
                        "Category & competitive audit",
                    ),
                ),
                card(
                    t("Visual Identity", "h3"),
                    bullets(
                        "Logo system & wordmark",
                        "Packaging design across 3 core SKUs",
                        "Type, color & art direction",
                    ),
                ),
                card(
                    t("Digital & Commerce", "h3"),
                    bullets(
                        "Shopify storefront redesign",
                        "Subscription & checkout flow",
                        "Photography & launch asset kit",
                    ),
                ),
            ),
        ),
        section(
            "timeline",
            group(
                t("04 · Timeline", "label"),
                t("Twelve weeks, four milestones.", "h2"),
                diagram("process", "Discovery, Strategy, Identity, Build, Launch", 180),
                bullets(
                    "Weeks 1–2 · Discovery sprint, stakeholder interviews, brand & UX audit",
                    "Weeks 3–6 · Strategy platform and two identity directions",
                    "Weeks 7–11 · Packaging, storefront design and front-end build",
                    "Week 12 · Launch, handover and brand guidelines",
                ),
            ),
        ),
        section(
            "team",
            row(
                group(img(pic(178), 1), t("Nora Vance", "h3"), t("Creative Director", "caption")),
                group(img(pic(179), 1), t("Devin Osei", "h3"), t("Brand Strategist", "caption")),
                group(img(pic(180), 1), t("Lina Park", "h3"), t("Design & Web Lead", "caption")),
            ),
        ),
        section(
            "investment",
            group(
                t("05 · Investment", "label"),
                t("A fixed-scope engagement.", "h2"),
                table(
                    "Phase,Timeline,Investment\nDiscovery & Strategy,2 weeks,$16K\nVisual Identity,4 weeks,$34K\nWebsite & Build,5 weeks,$39K\nLaunch & Handover,1 week,$11K\nTotal,12 weeks,$100K",
                ),
                t(
                    "50% to begin, 50% at launch. Excludes third-party costs (photography talent, licensed fonts, Shopify apps), estimated at $6–9K.",
                    "caption",
                ),
            ),
        ),
        section(
            "why-us",
            split(
                40,
                img(pic(181), 0.86),
                group(
                    t("06 · Why Foldwork", "label"),
                    t("We make brands people taste before they read.", "h2"),
                    bullets(
                        "Specialty-only · 14 food & beverage brands launched",
                        "Strategy and design under one roof, one team",
                        "We build what we design: no handoff, no surprises",
                    ),
                    callout(
                        "success",
                        t(
                            "Brands we’ve relaunched have seen an average 184% lift in DTC revenue in their first year.",
                            "body",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "track-record",
            row(
                stat("184%", "Avg. first-year DTC lift"),
                stat("14", "F&B brands launched"),
                stat("4.9★", "Average client rating"),
            ),
        ),
        section(
            "next-steps",
            split(
                60,
                group(
                    t("07 · Next steps", "label"),
                    t("Let’s get the first roast on.", "h2"),
                    t(
                        "If this resonates, we’ll schedule a 60-minute kickoff and hold a start date in July. This proposal is valid for 30 days.",
                        "subtitle",
                    ),
                    button("Approve & schedule kickoff"),
                ),
                img(pic(182), 0.86),
            ),
            { background: bgImage(pic(183, 1700, 1100), 0.58) },
        ),
    ],
    bgImage("https://images.pexels.com/photos/2455119/pexels-photo-2455119.jpeg", 0.35),
);

export const investorUpdate: ArtifactContent = doc(
    "clay",
    [
        section(
            "cover",
            group(
                t("INVESTOR UPDATE · MAY 2026", "label"),
                t("Cadence", "h1"),
                t(
                    "The billing engine for usage-based software. Another month of compounding, with MRR up 16% to $248K, NRR holding at 124%, and Usage Studio now shipped to every customer.",
                    "subtitle",
                ),
                t("Elena Vossberg · Co-founder & CEO", "caption"),
            ),
            { background: bgImage(pic(184, 1700, 1100), 0.55) },
        ),
        section(
            "tldr",
            callout(
                "success",
                group(
                    t("TL;DR", "label"),
                    bullets(
                        "MRR grew 16% MoM to $248K (≈ $3.0M ARR)",
                        "14 net-new logos (our best month yet) at 1.1% logo churn",
                        "Shipped Usage Studio: real-time metering for every customer",
                        "Runway extended to 21 months on improving gross margin",
                        "The ask: warm intros to Series A leads and a VP Sales",
                    ),
                ),
            ),
        ),
        section(
            "headline",
            group(
                row(
                    { align: "baseline", gap: 10 },
                    fitW(t("$248K", "h1")),
                    t("MRR, up 16% on the month.", "h2"),
                ),
                row(stat("124%", "Net revenue retention"), stat("21 mo", "Cash runway")),
            ),
        ),
        section(
            "growth",
            split(
                60,
                group(
                    t("Growth", "label"),
                    t("Six straight months of compounding.", "h2"),
                    t(
                        "Net revenue retention is doing the heavy lifting: existing customers expanding usage now drives 61% of new MRR. New-logo velocity is the other half, and it accelerated this month off the back of two enterprise wins.",
                        "body",
                    ),
                ),
                group(
                    chart("line", "131, 152, 171, 196, 214, 248", 240),
                    t("MRR, Dec 2025 – May 2026 ($K)", "caption"),
                ),
            ),
        ),
        section(
            "wins",
            group(
                t("Wins this month", "label"),
                t("What went right.", "h2"),
                bullets(
                    "Closed Northloop and Verge, our two largest contracts to date ($3.4K and $2.9K MRR)",
                    "Shipped Usage Studio: live metering, anomaly alerts and revenue forecasting",
                    "Completed SOC 2 Type II, unblocking three enterprise deals in the pipeline",
                    "Hired Sofia Reyes as VP Engineering (ex-Stripe, ex-Plaid)",
                    "Gross margin improved from 71% to 78% after the metering rewrite",
                ),
            ),
        ),
        section(
            "voice",
            quote(
                "Cadence replaced three internal tools and a spreadsheet the whole team was afraid of. We closed the books four days faster.",
                "Marisol Tan · VP Finance, Northloop",
            ),
            { background: bgImage(pic(185, 1700, 1100), 0.6) },
        ),
        section(
            "challenges",
            group(
                t("Challenges & lowlights", "label"),
                t("What we’re watching.", "h2"),
                t(
                    "Enterprise sales cycles are stretching: the SOC 2 deals are real but slow, averaging 71 days from first call to signature. We lost one SMB customer (Pinecrest, $2.1K MRR) to an in-house build, our first churn of that size. And a usage spike from two accounts pushed infra costs 22% over plan before we shipped autoscaling caps.",
                    "body",
                ),
                callout(
                    "caution",
                    t(
                        "Senior backend hiring is our critical path. Two offers are out; if both land we’re staffed for the Q3 roadmap. If neither does, Usage Studio v2 slips a month.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "metrics",
            group(
                t("By the numbers", "label"),
                t("Key metrics.", "h2"),
                table(
                    "Metric,April,May,Change\nMRR,$214K,$248K,+16%\nNet new logos,9,14,+5\nLogo churn,1.8%,1.1%,-0.7pt\nNRR,118%,124%,+6pt\nGross margin,71%,78%,+7pt\nCash runway,19 mo,21 mo,+2 mo",
                ),
            ),
        ),
        section(
            "product",
            split(
                40,
                img(pic(186), 1.2),
                group(
                    t("Product progress", "label"),
                    t("Usage Studio is live.", "h2"),
                    t(
                        "Customers can now watch metered usage in real time, set anomaly alerts and forecast next-month revenue straight from live consumption. Adoption hit 64% of accounts in three weeks. It’s already the most-opened screen in the product and the top reason cited in deals we won this month.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "ask",
            group(
                t("The ask", "label"),
                t("How you can help.", "h2"),
                bullets(
                    "Intros to Series A leads in fintech infra or usage-based SaaS: we open the round in Q3",
                    "Candidates for VP Sales, taking us from PLG into a sales-led enterprise motion",
                    "Design partners in fintech and dev-tools with metered-billing pain",
                    "Anyone you know wrestling with the limits of Stripe billing",
                ),
                button("elena@cadence.dev"),
            ),
        ),
        section(
            "thanks",
            group(
                t(
                    "Thank you for the intros, the candidates and the patience. Reply to this update anytime; I read and answer every one.",
                    "subtitle",
                ),
                t("Elena Vossberg · Co-founder & CEO, Cadence · May 2026", "caption"),
            ),
            { background: bgImage(pic(187, 1700, 1100), 0.6) },
        ),
    ],
    bgImage("https://images.pexels.com/photos/15060583/pexels-photo-15060583.jpeg", 0.3),
);

export const businessProposal: ArtifactContent = doc(
    "chalk",
    [
        section(
            "cover",
            group(
                t("PROPOSAL · PREPARED FOR BRIGHTLINE MANUFACTURING", "label"),
                t("Power the plant with the roof you already own.", "h1"),
                t(
                    "Cascade Solar & Energy on a 1.4-megawatt rooftop and carport solar system for the Brightline plant in Reno, engineered to cut energy spend 68% and pay for itself in under six years. Prepared for the Brightline leadership team, June 2026.",
                    "subtitle",
                ),
                badge("CONFIDENTIAL · v1.2"),
            ),
            { background: bgImage(pic(188, 1700, 1100), 0.55) },
        ),
        section(
            "summary",
            group(
                t("Executive summary", "label"),
                t("A 1.4-megawatt system that pays for itself.", "h2"),
                t(
                    "Brightline spent $1.18M on electricity last year, and exposure to peak-demand charges is climbing. This proposal outlines a turnkey solar and storage system that offsets 68% of that load from day one, locks in your energy cost for 25 years, and qualifies for $1.9M in federal and state incentives. Cascade designs, permits, builds, and monitors the entire system: a single point of accountability from contract to commissioning.",
                    "body",
                ),
                callout(
                    "success",
                    t(
                        "Estimated 25-year net savings of $7.4M, with a 5.8-year payback and a 17% internal rate of return.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "needs",
            split(
                60,
                group(
                    t("01 · Understanding your needs", "label"),
                    t("What we heard from your team.", "h2"),
                    bullets(
                        "Cut a $1.18M annual energy bill that grows 6–8% a year",
                        "Hedge against Nevada peak-demand and time-of-use charges",
                        "Hit the 2030 corporate carbon-neutral commitment",
                        "Keep the line running: zero downtime during installation",
                        "A financing structure that protects working capital",
                    ),
                ),
                img(pic(189), 0.82),
            ),
        ),
        section(
            "opportunity",
            split(
                60,
                group(
                    t("02 · The opportunity", "label"),
                    t("Your energy cost is only going one way.", "h2"),
                    t(
                        "Without action, Brightline’s electricity spend climbs to roughly $1.7M a year by 2031 on current rate trajectories. The solar system flips that curve: after year six the marginal cost of your generated power is effectively zero, and the savings compound for two more decades.",
                        "body",
                    ),
                ),
                group(
                    chart("line", "1.18, 1.27, 1.36, 1.47, 1.58, 1.70", 240),
                    t("Projected utility spend without solar, 2026–2031 ($M)", "caption"),
                ),
            ),
        ),
        section(
            "solution",
            split(
                40,
                img(pic(190), 1.05),
                group(
                    t("03 · Proposed solution", "label"),
                    t("Rooftop, carport, and storage: one integrated system.", "h2"),
                    bullets(
                        "1.4 MW of high-efficiency panels across 180,000 sq ft of roof",
                        "420 kW solar carport over the north employee lot",
                        "600 kWh battery storage to shave peak-demand charges",
                        "Real-time monitoring with the Cascade Energy dashboard",
                    ),
                ),
            ),
        ),
        section(
            "scope",
            row(
                card(
                    t("Design & Engineering", "h3"),
                    bullets(
                        "Structural & electrical engineering",
                        "Shade & production modeling",
                        "Utility interconnection design",
                    ),
                ),
                card(
                    t("Permitting & Build", "h3"),
                    bullets(
                        "All permits & inspections handled",
                        "Panel, carport & inverter install",
                        "Battery & switchgear integration",
                    ),
                ),
                card(
                    t("Monitor & Maintain", "h3"),
                    bullets(
                        "24/7 production monitoring",
                        "Annual cleaning & inspection",
                        "25-year performance guarantee",
                    ),
                ),
            ),
        ),
        section(
            "timeline",
            group(
                t("04 · Timeline", "label"),
                t("Twenty weeks to switch-on, zero plant downtime.", "h2"),
                diagram("process", "Design, Permit, Install, Commission, Monitor", 180),
                bullets(
                    "Weeks 1–4 · Engineering, production modeling and final design",
                    "Weeks 5–9 · Permitting and utility interconnection approval",
                    "Weeks 10–17 · Rooftop, carport and storage install, staged around your production calendar",
                    "Weeks 18–20 · Commissioning, utility sign-off and dashboard handover",
                ),
            ),
        ),
        section(
            "pricing",
            group(
                t("05 · Pricing & terms", "label"),
                t("A transparent, fixed-price engagement.", "h2"),
                table(
                    "Line item,Detail,Investment\nSolar array (1.4 MW),Panels racking and inverters,$2.34M\nSolar carport (420 kW),Structure and install,$0.61M\nBattery storage (600 kWh),Hardware and integration,$0.48M\nEngineering & permitting,Design permits and interconnect,$0.27M\nGross system cost,,$3.70M\nIncentives (30% ITC + state),Federal and Nevada credits,-$1.90M\nNet investment,After incentives,$1.80M",
                ),
                t(
                    "Financing available: $0-down power purchase agreement at $0.071/kWh, or a cash purchase on the schedule above. 25-year workmanship and production warranty included.",
                    "caption",
                ),
            ),
        ),
        section(
            "why-us",
            row(
                stat("142 MW", "Commercial solar installed"),
                stat("99.4%", "Average system uptime"),
                stat("5.8 yr", "Typical payback period"),
            ),
        ),
        section(
            "reference",
            quote(
                "Cascade ran the whole project around our production schedule. We never lost an hour on the line, and our power bill dropped 71% the first month it switched on.",
                "Renata Pho · Director of Operations, Sierra Foods",
            ),
            { background: bgImage(pic(191, 1700, 1100), 0.6) },
        ),
        section(
            "team",
            row(
                group(
                    img(pic(192), 1),
                    t("Marcus Bell", "h3"),
                    t("Lead Project Engineer", "caption"),
                ),
                group(
                    img(pic(193), 1),
                    t("Yuki Tanaka", "h3"),
                    t("Energy Modeling & Finance", "caption"),
                ),
                group(
                    img(pic(194), 1),
                    t("Darnell Cruz", "h3"),
                    t("Construction Manager", "caption"),
                ),
            ),
        ),
        section(
            "accept",
            split(
                60,
                group(
                    t("06 · Acceptance & next steps", "label"),
                    t("Let’s lock in your rate for the next 25 years.", "h2"),
                    t(
                        "To proceed, countersign below and we’ll schedule a site survey within ten business days and hold a Q3 installation slot. This proposal and pricing are valid for 45 days.",
                        "subtitle",
                    ),
                    button("Approve & schedule site survey"),
                ),
                img(pic(195), 0.86),
            ),
            { background: bgImage(pic(196, 1700, 1100), 0.58) },
        ),
    ],
    bgImage("https://images.pexels.com/photos/24342984/pexels-photo-24342984.jpeg", 0.35),
);

export const boardDeck: ArtifactContent = deck(
    "press",
    [
        section(
            "cover",
            group(
                t("BOARD MEETING · Q2 FY2026", "label"),
                t("Tideline", "h1"),
                t(
                    "Product analytics for teams that ship daily. A strong quarter: ARR up 19% to $6.2M, NRR holding at 121%, and the Signals launch already live in 38% of accounts. Prepared for the board, June 2026.",
                    "subtitle",
                ),
                t("Priya Anand · Co-founder & CEO", "caption"),
            ),
            { background: bgImage(pic(197, 1700, 1100), 0.55) },
        ),
        section(
            "agenda",
            group(
                t("Agenda", "label"),
                t("What we’ll cover today.", "h2"),
                bullets(
                    "The quarter at a glance · KPIs vs. plan",
                    "Financials · revenue, burn and runway",
                    "Growth & funnel · pipeline and conversion",
                    "Product & ops · what shipped, what’s next",
                    "Team & hiring · org and key roles",
                    "Risks & mitigations",
                    "Priorities for Q3",
                    "Open discussion",
                ),
            ),
        ),
        section(
            "glance",
            row(
                stat("$6.2M", "ARR · +19% QoQ"),
                stat("121%", "Net revenue retention"),
                stat("16 mo", "Cash runway"),
            ),
        ),
        section(
            "financials-rev",
            split(
                60,
                group(
                    t("01 · Financials", "label"),
                    t("Six quarters of compounding growth.", "h2"),
                    t(
                        "ARR reached $6.2M, up 19% quarter-over-quarter and 7 points ahead of plan. Expansion revenue drove 58% of net-new ARR: existing accounts are growing faster than we’re adding logos, which is exactly the shape we want heading into the Series B.",
                        "body",
                    ),
                ),
                group(
                    chart("line", "2.9, 3.4, 4.0, 4.6, 5.2, 6.2", 240),
                    t("ARR by quarter, Q1 FY25 – Q2 FY26 ($M)", "caption"),
                ),
            ),
        ),
        section(
            "financials-table",
            group(
                t("01 · Financials", "label"),
                t("The numbers vs. plan.", "h2"),
                table(
                    "Metric,Q1,Q2,Plan,vs. Plan\nARR,$5.2M,$6.2M,$5.8M,+7%\nNet new ARR,$0.6M,$1.0M,$0.8M,+25%\nNRR,118%,121%,118%,+3pt\nGross margin,79%,81%,80%,+1pt\nNet burn,$0.34M,$0.31M,$0.38M,better\nCash runway,15 mo,16 mo,13 mo,+3 mo",
                ),
            ),
        ),
        section(
            "funnel",
            split(
                40,
                group(
                    t("02 · Growth & funnel", "label"),
                    t("The funnel is tightening.", "h2"),
                    t(
                        "Top-of-funnel held steady while activation and paid conversion both improved, a product-led motion finally compounding. Sales-assisted deals now close 22% faster after we shipped the in-product trial extension.",
                        "body",
                    ),
                ),
                diagram(
                    "funnel",
                    "12.4K signups, 7.8K activated, 1.9K trials, 540 closed-won",
                    240,
                ),
            ),
        ),
        section(
            "product",
            split(
                40,
                img(pic(198), 1.2),
                group(
                    t("03 · Product & ops", "label"),
                    t("Signals shipped, and it’s landing.", "h2"),
                    bullets(
                        "Launched Signals: automated anomaly detection on any metric",
                        "Adoption hit 38% of accounts in five weeks",
                        "Cut median dashboard load time from 2.4s to 0.9s",
                        "99.98% platform uptime, best quarter on record",
                    ),
                ),
            ),
        ),
        section(
            "team",
            split(
                60,
                group(
                    t("04 · Team & hiring", "label"),
                    t("Scaling the org behind the growth.", "h2"),
                    t(
                        "We grew from 38 to 49 full-time staff this quarter, weighted toward engineering and customer success. The VP Sales search is in final-round interviews with two strong candidates; we expect an offer out by mid-July.",
                        "body",
                    ),
                ),
                group(chart("column", "38, 41, 44, 49", 240), t("Headcount by quarter", "caption")),
            ),
        ),
        section(
            "voice",
            quote(
                "Tideline is the first analytics tool our PMs actually open every morning. Signals caught a checkout regression before our on-call did.",
                "Theo Marsh · Head of Product, Loop Commerce",
            ),
            { background: bgImage(pic(199, 1700, 1100), 0.6) },
        ),
        section(
            "risks",
            row(
                callout(
                    "caution",
                    group(
                        t("Sales leadership gap", "h3"),
                        t(
                            "We’ve run two quarters without a VP Sales, capping enterprise pipeline. Mitigation: two finalists in process, offer expected mid-July; founders are covering the top deals until then.",
                            "body",
                        ),
                    ),
                ),
                callout(
                    "warn",
                    group(
                        t("Revenue concentration", "h3"),
                        t(
                            "Our top 5 accounts are 31% of ARR. Mitigation: a dedicated mid-market motion launches in Q3 to broaden the base and dilute concentration risk.",
                            "body",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "priorities",
            row(
                card(
                    t("Close the Series B", "h3"),
                    bullets(
                        "Open the round in August",
                        "Target $18M at a $90M cap",
                        "Two term sheets as the goal",
                    ),
                ),
                card(
                    t("Ship Signals v2", "h3"),
                    bullets(
                        "Custom alert routing",
                        "Slack & PagerDuty integrations",
                        "Forecasting on any metric",
                    ),
                ),
                card(
                    t("Build the sales engine", "h3"),
                    bullets(
                        "Hire VP Sales & two AEs",
                        "Launch the mid-market motion",
                        "Lift NRR toward 125%",
                    ),
                ),
            ),
        ),
        section(
            "discussion",
            group(
                t("05 · Discussion", "label"),
                t("Where we’d value the board’s input.", "h2"),
                bullets(
                    "Series B timing and the target investor list",
                    "The right pace of sales hiring vs. burn",
                    "Whether to accelerate the mid-market motion",
                    "Intros to VP Sales candidates and design partners",
                ),
                button("Open discussion"),
            ),
            { background: bgImage(pic(200, 1700, 1100), 0.6) },
        ),
    ],
    bgImage("https://images.pexels.com/photos/19215108/pexels-photo-19215108.jpeg", 0.3),
);

export const sponsorshipDeck: ArtifactContent = deck(
    "royal",
    [
        section(
            "cover",
            group(
                t("HARBORLIGHT FESTIVAL 2026 · SPONSORSHIP PROSPECTUS", "label"),
                t("Three days on the water. One unforgettable summer.", "h1"),
                t(
                    "Harborlight is Oakhaven’s flagship waterfront festival: three days of live music, regional food, and public art on the working piers. We’re inviting a small circle of partners to help us build the 2026 edition, and to reach the 65,000 people who’ll spend a long weekend with us.",
                    "subtitle",
                ),
                badge("AUG 14–16, 2026 · PIER 9, OAKHAVEN"),
            ),
            { background: bgImage(pic(201, 1700, 1100), 0.55) },
        ),

        section(
            "property",
            split(
                60,
                group(
                    t("THE PROPERTY", "label"),
                    t("A festival the whole region plans its summer around.", "h2"),
                    t(
                        "What started in 2014 as a single-stage block party on Pier 9 has grown into the largest open-air event on the Oakhaven calendar. Four stages, a 40-vendor food market, a juried art walk, and a free family programme run from Friday afternoon to Sunday night, all framed by the harbor and the city skyline behind it.",
                        "body",
                    ),
                    t(
                        "It is independently produced, fiercely local, and sold out three years running. Partners aren’t buying a logo placement. They’re buying a place in the weekend people remember.",
                        "body",
                    ),
                ),
                img(pic(202), 0.82),
            ),
        ),

        section(
            "audience",
            row(
                group(
                    t("OUR AUDIENCE", "label"),
                    stat("65K", "attendees across the three-day weekend"),
                ),
                stat("68%", "aged 21–44, the hard-to-reach experiential spender"),
                stat("$120", "average per-person spend on-site, beyond the ticket"),
            ),
        ),

        section(
            "reach",
            split(
                40,
                group(
                    chart("column", "18, 27, 38, 52, 65", 240),
                    t(
                        "Paid attendance by year, in thousands (2018 → 2025). 2025 sold out in nine days.",
                        "caption",
                    ),
                ),
                group(
                    t("REACH & ENGAGEMENT", "label"),
                    t("The crowd is only half the story.", "h2"),
                    t(
                        "Harborlight lives online long after the last set ends. Our channels and the attendee-generated wave around them turn a single weekend into a months-long conversation that your brand sits inside of.",
                        "body",
                    ),
                    bullets(
                        "4.2M social impressions across the 2025 campaign window",
                        "240K combined followers on Instagram, TikTok & email",
                        "11M earned media impressions from 38 press placements",
                    ),
                ),
            ),
        ),

        section(
            "why",
            group(
                t("WHY PARTNER WITH US", "label"),
                t("A weekend of goodwill you can’t buy in a feed.", "h2"),
                t(
                    "People arrive at Harborlight relaxed, generous, and ready to discover. That’s a context most marketing never gets near. Our partners improve the experience rather than interrupting it: shade and water on a hot pier, the charging lockers that save a night, the ferry that gets everyone home. Sponsorship here reads as hosting, not advertising, and the audience remembers who hosted them.",
                    "body",
                ),
                button("Talk to our partnerships team"),
            ),
            { background: bgImage(pic(203, 1700, 1100), 0.6) },
        ),

        section(
            "activations",
            row(
                card(
                    img(pic(204), 1.4),
                    t("Branded lounges", "h3"),
                    t(
                        "Shaded waterfront decks with seating, charging, and your brand as the host of the calm.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(205), 1.4),
                    t("Sampling & retail", "h3"),
                    t(
                        "Hand product to 65,000 people in the exact moment they’re open to trying something new.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(206), 1.4),
                    t("Stage & moment naming", "h3"),
                    t(
                        "Put your name on a stage, the sunset set, or the after-dark fireworks over the harbor.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "tiers",
            group(
                t("SPONSORSHIP TIERS", "label"),
                t("Four ways in. One conversation to find your fit.", "h2"),
                table(
                    "Tier,Investment,Availability,Headline benefit\nPresenting,$120K,1 partner,“Harborlight presented by” lockup across all assets\nStage,$60K,4 partners,Naming rights to a named stage + on-stage moments\nMarket,$28K,8 partners,Premium activation footprint in the food & art market\nCommunity,$9K,12 partners,Logo placement · tickets & a sampling table",
                ),
                t(
                    "Every tier is a starting point: we build the activation around your goals, not a fixed menu.",
                    "caption",
                ),
            ),
        ),

        section(
            "benefits",
            split(
                60,
                group(
                    t("WHAT SPONSORS GET", "label"),
                    t("Reach, hospitality, and a story worth telling.", "h2"),
                    bullets(
                        "Brand integration across stages, signage, app and site",
                        "A turnkey activation footprint: power, water, load-in handled",
                        "A VIP hospitality allotment: tickets, the harbor-deck lounge, and artist access",
                        "A place in the 4M+ reach media campaign, with full post-event reporting",
                    ),
                ),
                group(
                    img(pic(207), 0.9),
                    t(
                        "The harbor-deck hospitality lounge, where partners host clients above the crowd.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "results",
            row(
                group(
                    t("PAST PARTNERS & RESULTS", "label"),
                    stat("3.1M", "branded impressions delivered for our 2025 presenting partner"),
                ),
                stat("42K", "product samples handed out across the weekend"),
                stat("94%", "of 2025 partners renewed or upgraded for 2026"),
            ),
        ),

        section(
            "quote",
            quote(
                "Harborlight is the only sponsorship on our calendar where the audience thanks us for being there. We didn’t buy attention. We earned a weekend of it.",
                "Priya Anand · VP Brand, Northwater Seltzer · Presenting Partner 2024–25",
            ),
            { background: bgImage(pic(208, 1700, 1100), 0.62) },
        ),

        section(
            "ask",
            split(
                40,
                img(pic(209), 1.05),
                group(
                    t("THE ASK", "label"),
                    t("Let’s build your 2026 weekend.", "h2"),
                    t(
                        "Tiers are confirmed on a first-come basis and the presenting slot moves fast. We hold partner conversations through March and lock the roster by April 1. Send us your goals and we’ll come back with a tailored activation plan and a single, simple agreement.",
                        "body",
                    ),
                    button("partners@harborlightfest.org"),
                ),
            ),
        ),
    ],
    bgImage(pic(210, 1700, 1100), 0.32),
);

export const sow: ArtifactContent = doc(
    "chalk",
    [
        section(
            "cover",
            group(
                t("STATEMENT OF WORK · SOW-2026-014", "label"),
                t("Commerce Replatform & Returns Portal", "h1"),
                t(
                    "Prepared by Anvil & Oak Studio for Wexford Outdoor Co. This Statement of Work defines the scope, deliverables, timeline, and commercial terms for a twelve-week engagement to replatform wexfordoutdoor.com and ship a self-service returns experience.",
                    "subtitle",
                ),
                t(
                    "Effective: July 6, 2026 · Master Services Agreement dated March 2, 2026",
                    "caption",
                ),
            ),
            { background: bgImage(pic(211, 1700, 1100), 0.55) },
        ),

        section(
            "overview",
            split(
                60,
                group(
                    t("1 · PROJECT OVERVIEW", "label"),
                    t("Replatform the storefront, and stop returns from leaking revenue.", "h2"),
                    t(
                        "Wexford Outdoor Co. runs a high-traffic Shopify storefront on an aging custom theme that no longer keeps pace with its catalog or its peak-season load. Returns are handled by email and a shared inbox, which costs the support team an estimated 40 hours a week and frustrates customers.",
                        "body",
                    ),
                    t(
                        "Anvil & Oak will rebuild the storefront on a headless architecture and deliver a branded, self-service returns and exchange portal integrated with Wexford’s existing fulfillment and OMS systems.",
                        "body",
                    ),
                ),
                img(pic(212), 0.82),
            ),
        ),

        section(
            "objectives",
            group(
                t("2 · OBJECTIVES", "label"),
                t("What success looks like.", "h2"),
                t(
                    "The engagement is considered successful when the following business outcomes are met within ninety days of launch:",
                    "body",
                ),
                bullets(
                    "Reduce storefront median page load to under 1.5s on 4G, measured by Core Web Vitals",
                    "Cut return-handling support time by 60% through self-service automation",
                    "Increase exchange-over-refund rate to 35%, retaining revenue inside the brand",
                    "Support a 4× traffic spike during the autumn sale with no manual scaling",
                ),
            ),
        ),

        section(
            "at-a-glance",
            row(
                group(
                    t("AT A GLANCE", "label"),
                    stat("12 wks", "engagement, kickoff to production launch"),
                ),
                stat("5", "named deliverables across two workstreams"),
                stat("$186K", "fixed fee, billed against five milestones"),
            ),
        ),

        section(
            "approach",
            split(
                40,
                group(
                    img(pic(213), 1.05),
                    t(
                        "Discovery workshops run on-site in week one to lock scope before any code ships.",
                        "caption",
                    ),
                ),
                group(
                    t("3 · OUR APPROACH", "label"),
                    t("Five phases, weekly demos, no surprises.", "h2"),
                    t(
                        "We work in one-week iterations with a Friday demo and a shared backlog. Each phase ends in a reviewable artifact and a written sign-off, so scope and budget stay visible from day one.",
                        "body",
                    ),
                    diagram("process", "Discovery, Design, Build, QA & UAT, Launch", 180),
                ),
            ),
        ),

        section(
            "scope",
            group(
                t("4 · SCOPE OF WORK", "label"),
                t("In scope.", "h2"),
                t("Anvil & Oak will design, build, and deliver the following:", "body"),
                bullets(
                    "A headless storefront (Next.js) consuming Shopify’s Storefront API, with ISR and edge caching",
                    "Responsive design system covering 18 templates: home, collection, product, cart, and account",
                    "A self-service returns & exchange portal with policy rules, label generation, and status tracking",
                    "Integrations with the existing OMS, ShipStation, and the Klaviyo marketing stack",
                    "Analytics instrumentation, a staging environment, and CI/CD on the client’s Vercel account",
                    "Content migration of the existing catalog, redirects, and SEO metadata",
                ),
            ),
        ),

        section(
            "out-of-scope",
            split(
                60,
                callout(
                    "warn",
                    group(
                        t("5 · OUT OF SCOPE", "label"),
                        t(
                            "To keep the timeline and fee firm, the following are explicitly excluded from this SOW and may be addressed under a separate change order:",
                            "body",
                        ),
                        bullets(
                            "Net-new photography, copywriting, or brand identity work",
                            "Replatforming the ERP, warehouse (WMS), or payment processor",
                            "Native iOS / Android applications",
                            "Ongoing post-launch support beyond the 30-day warranty period",
                            "Third-party app license fees and infrastructure hosting costs",
                        ),
                    ),
                ),
                img(pic(214), 0.78),
            ),
        ),

        section(
            "deliverables",
            group(
                t("6 · DELIVERABLES", "label"),
                t("What you receive, and when.", "h2"),
                table(
                    "Deliverable,Description,Format,Due\nD1 · Discovery brief,Technical audit · scope lock & architecture diagram,PDF + Figma,Week 2\nD2 · Design system,Component library & 18 responsive templates,Figma,Week 4\nD3 · Storefront,Production-ready headless build with CI/CD,Git repo + staging,Week 9\nD4 · Returns portal,Self-service returns & exchange flow,Git repo + staging,Week 10\nD5 · Launch package,Cutover plan · runbook & analytics dashboards,PDF + Looker,Week 12",
                ),
            ),
        ),

        section(
            "timeline",
            group(
                t("7 · TIMELINE & MILESTONES", "label"),
                t("A twelve-week path to launch.", "h2"),
                diagram(
                    "process",
                    "Wk 1–2 Discovery, Wk 3–4 Design, Wk 5–9 Build, Wk 10–11 QA & UAT, Wk 12 Launch",
                    200,
                ),
                t(
                    "Milestone acceptance is due within five business days of delivery; absent written objection, a deliverable is deemed accepted.",
                    "caption",
                ),
            ),
        ),

        section(
            "roles",
            group(
                t("8 · ROLES & RESPONSIBILITIES", "label"),
                t("Who owns what.", "h2"),
                table(
                    "Role,Name,Responsibility,Party\nEngagement lead,Dana Okonkwo,Scope · schedule & weekly status,Anvil & Oak\nTech lead,Marcus Vey,Architecture & code review,Anvil & Oak\nProduct designer,Lena Sørensen,Design system & UX,Anvil & Oak\nProduct owner,Tom Bryce,Decisions · approvals & content,Wexford\nIT liaison,Sara Whitlock,System access & integrations,Wexford",
                ),
                t(
                    "Wexford will provide environment access and consolidated feedback within two business days of each request.",
                    "caption",
                ),
            ),
        ),

        section(
            "pricing",
            group(
                t("9 · PRICING & PAYMENT TERMS", "label"),
                t("Fixed fee, billed against milestones.", "h2"),
                table(
                    "Milestone,Trigger,Amount,Payment terms\nM1 · Kickoff,SOW execution,$37.2K,Due on signing\nM2 · Design accepted,D2 sign-off,$46.5K,Net 15\nM3 · Build complete,D3 sign-off,$55.8K,Net 15\nM4 · UAT passed,D4 sign-off,$28K,Net 15\nM5 · Launch,Production cutover,$18.5K,Net 15\nTotal,,$186K,",
                    true,
                    1,
                ),
                t(
                    "Fees are fixed for the scope above. Approved change orders are billed at a blended rate of $215/hour.",
                    "caption",
                ),
            ),
        ),

        section(
            "assumptions",
            group(
                t("10 · ASSUMPTIONS & DEPENDENCIES", "label"),
                t("What this plan relies on.", "h2"),
                callout(
                    "info",
                    t(
                        "The timeline and fee in this SOW assume the conditions below hold. A material change to any of them may trigger a written change order adjusting scope, schedule, or cost.",
                        "body",
                    ),
                ),
                bullets(
                    "Wexford’s Shopify Plus plan and existing API credentials remain available throughout",
                    "Product, pricing, and inventory data are supplied in a clean, agreed export format by Week 2",
                    "A single product owner is empowered to give binding approvals within the agreed SLAs",
                    "Third-party services (ShipStation, Klaviyo, OMS) expose stable, documented APIs",
                ),
            ),
        ),

        section(
            "acceptance",
            group(
                t("11 · ACCEPTANCE", "label"),
                t("Authorization to proceed.", "h2"),
                t(
                    "By signing below, the parties agree to the scope, deliverables, timeline, and commercial terms set out in this Statement of Work, governed by the Master Services Agreement dated March 2, 2026.",
                    "body",
                ),
                table(
                    "Party,Signatory,Title,Date\nAnvil & Oak Studio,Dana Okonkwo,Principal,_______________\nWexford Outdoor Co.,Tom Bryce,VP Digital,_______________",
                ),
                button("Sign & return this SOW"),
            ),
        ),
    ],
    bgImage("https://images.pexels.com/photos/28380105/pexels-photo-28380105.jpeg", 0.3),
);

export const annualReport: ArtifactContent = doc(
    "press",
    [
        section(
            "s1",
            group(
                t("ANNUAL REPORT · FISCAL 2025", "label"),
                t("Solstice", "h1"),
                t(
                    "Powering homes that give back. A year we crossed half a billion in revenue, doubled our storage business, and put clean energy on 142,000 roofs.",
                    "subtitle",
                ),
                t(
                    "Solstice Energy, Inc. · Denver, Colorado · Year ended December 31, 2025",
                    "caption",
                ),
                badge("NYSE: SOLS · 1,280 EMPLOYEES · 14 STATES"),
            ),
            { background: bgImage(pic(215, 1700, 1100), 0.55) },
        ),
        section(
            "s2",
            split(
                60,
                group(
                    t("A letter from our CEO", "label"),
                    t("We built this year to last.", "h2"),
                    t(
                        "When we founded Solstice in a garage in 2014, the pitch was simple and a little naïve: a home should make more than it takes. Eleven years later that idea is a business of real scale, and 2025 was the year it stopped being a promise and became a balance sheet.",
                        "subtitle",
                    ),
                    t(
                        "Revenue grew 37% to $548 million. We installed our hundred-thousandth solar roof, shipped our first home battery, and turned tens of thousands of households into a single, dispatchable power plant. We did all of it while bringing operating losses down to their lowest level ever. Doing this well and doing this responsibly are the same project, not competing ones.",
                        "body",
                    ),
                    t(
                        "None of it happened in a straight line. Interest rates made financing harder, two product launches slipped a quarter, and we learned (again) that the hardest part of energy is not the panel on the roof but the permit on the desk. What did not waver was our team and the families who trusted us. This report is, more than anything, an accounting of that trust.",
                        "body",
                    ),
                    t("Naomi Okonkwo, Co-founder & Chief Executive Officer", "caption"),
                ),
                img(pic(216), 0.82),
            ),
        ),
        section(
            "s3",
            group(
                t("2025 in review", "label"),
                t("The year in numbers", "h2"),
                t(
                    "Three figures capture where Solstice stood at year end: how much we earned, how much clean energy we made, and how many homes were counting on us to make it.",
                    "subtitle",
                ),
            ),
        ),
        section(
            "s4",
            row(
                stat("$548M", "total revenue, up 37% year over year"),
                stat("1.9M MWh", "clean electricity generated across the network"),
                stat("142,000", "homes powered in 14 states"),
            ),
        ),
        section(
            "s5",
            split(
                60,
                group(
                    t("Financial highlights", "label"),
                    t("Revenue crossed half a billion.", "h2"),
                    t(
                        "Top-line growth held above 35% for the fifth consecutive year, driven by a record install season and the first full year of battery sales. Gross margin expanded 410 basis points to 31.2% as panel costs fell and our install crews got faster.",
                        "body",
                    ),
                    stat("31.2%", "gross margin, up from 27.1% in FY2024"),
                ),
                group(
                    chart("line", "88, 142, 221, 318, 401, 548", 300),
                    t("Total revenue, $M, FY2020–FY2025", "caption"),
                ),
            ),
        ),
        section(
            "s6",
            group(
                t("Financial highlights", "label"),
                t("Where the growth came from", "h2"),
                t(
                    "Storage was the breakout story of the year (Solstice One nearly doubled the segment) while software and services grew steadily as more homes came onto recurring plans. Wholesale and financing shrank deliberately as we tightened underwriting in a higher-rate environment.",
                    "body",
                ),
                table(
                    "Segment,FY2024,FY2025,Change\nHome solar,$246M,$318M,+29%\nBattery storage,$78M,$142M,+82%\nSoftware & services,$51M,$64M,+25%\nWholesale & financing,$26M,$24M,−8%\nTotal,$401M,$548M,+37%",
                ),
                chart("column", "318, 142, 64, 24", 260),
                t("FY2025 revenue by segment, $M", "caption"),
            ),
        ),
        section(
            "s7",
            group(
                t("Product & milestones", "label"),
                t("A year of shipping", "h2"),
                t(
                    "We promised investors three things at the start of 2025: a home battery, a rebuilt app, and a way for customers to earn from the grid. By December all three were live, the first time we have landed an entire roadmap in a single year.",
                    "subtitle",
                ),
                diagram(
                    "process",
                    "Solstice One battery, Aurora 3.0 app, GridShare VPP, Nationwide care",
                    200,
                ),
            ),
            { background: bgImage(pic(217, 1700, 1100), 0.6) },
        ),
        section(
            "s8",
            row(
                card(
                    img(pic(218), 1),
                    t("Solstice One", "h3"),
                    t(
                        "Our first home battery: 13.5 kWh, whole-home backup, installed in a single day.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(219), 1),
                    t("Aurora 3.0", "h3"),
                    t(
                        "A rebuilt app that turns every roof into a dashboard, and every storm into a plan.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(220), 1),
                    t("GridShare", "h3"),
                    t(
                        "A virtual power plant that pays members to share stored energy when demand peaks.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s9",
            split(
                40,
                img(pic(221), 1.05),
                group(
                    t("Our people", "label"),
                    t("The company is the crew.", "h2"),
                    t(
                        "Solar is still a job done on a ladder, in the sun, with your hands. In 2025 we grew the team to 1,280 (most of them installers, electricians, and care specialists) and brought our in-house apprenticeship to nine cities, training 210 new electricians from the communities we serve.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "s10",
            row(
                stat("1,280", "team members across engineering, install, and care"),
                stat("92", "employee net promoter score (eNPS)"),
                stat("38%", "of leadership roles held by women"),
            ),
        ),
        section(
            "s11",
            callout(
                "success",
                group(
                    t("Sustainability & community", "label"),
                    t("The point was never just the panels.", "h3"),
                    t(
                        "Energy from the Solstice network avoided 1.1 million tonnes of CO₂ in 2025, the equivalent of taking 240,000 cars off the road. We recovered and recycled 96% of decommissioned hardware, and the Solstice Community Fund committed $4M to put rooftop solar and storage on 60 schools and clinics in neighborhoods that the energy transition usually reaches last.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "s12",
            split(
                60,
                group(
                    t("Looking ahead", "label"),
                    t("What we're building in 2026", "h2"),
                    t(
                        "We enter the year with the strongest backlog in our history and a clear mandate: get faster, get bigger, and turn the corner to profitability.",
                        "subtitle",
                    ),
                    bullets(
                        "Open three regional install hubs to cut wait times below ten days",
                        "Ship Solstice One v2: 30% more capacity at the same price",
                        "Enroll 50,000 homes in GridShare, our virtual power plant",
                        "Expand into four new states across the Southeast",
                        "Reach cash-flow-positive operations by the end of FY2026",
                    ),
                ),
                img(pic(222), 0.9),
            ),
            { background: bgImage(pic(223, 1700, 1100), 0.5) },
        ),
        section(
            "s13",
            group(
                t(
                    "To our customers, our crews, and our shareholders: thank you for a year that asked a lot and gave back more. The sun came up 365 times in 2025. So did we.",
                    "subtitle",
                ),
                t(
                    "Solstice Energy, Inc. · Form 10-K and full financial statements available at investors.solstice.energy · Denver, Colorado · February 2026",
                    "caption",
                ),
            ),
        ),
    ],
    bgImage("https://images.pexels.com/photos/30332204/pexels-photo-30332204.jpeg", 0.3),
);

export const caseStudy: ArtifactContent = doc(
    "gazette",
    [
        section(
            "s1",
            group(
                t("CUSTOMER STORY · MARLOW HOSPITALITY GROUP", "label"),
                t("Scaling hospitality without scaling the chaos", "h1"),
                t(
                    "How a 22-restaurant group cut labor costs 18% and opened six new locations in a year, with one platform running the floor behind the scenes.",
                    "subtitle",
                ),
                t("A Tempo case study · Hospitality · 12-month engagement", "caption"),
                badge("PUBLISHED WITH PERMISSION · MARLOW HOSPITALITY GROUP"),
            ),
            { background: bgImage(pic(224, 1700, 1100), 0.55) },
        ),
        section(
            "s2",
            split(
                60,
                group(
                    t("The customer", "label"),
                    t("Twenty-two kitchens, one standard", "h2"),
                    t(
                        "Marlow Hospitality Group runs some of the most loved tables on the East Coast, from the original Marlow & Sons bistro in Brooklyn to fast-casual counters in three airports. What ties them together isn't a menu; it's a promise that the service feels the same whether you're in seat 4 or location 22.",
                        "subtitle",
                    ),
                    t(
                        "By 2024 that promise was getting expensive to keep. Each restaurant scheduled its own staff in its own spreadsheet, and a 1,400-person workforce was being managed by 22 people who had never met.",
                        "body",
                    ),
                ),
                img(pic(225), 0.82),
            ),
        ),
        section(
            "s3",
            row(
                stat("22", "restaurants across 5 cities"),
                stat("1,400", "hourly team members"),
                stat("Est. 2009", "Brooklyn, New York"),
            ),
        ),
        section(
            "s4",
            split(
                40,
                img(pic(226), 1.05),
                group(
                    t("The challenge", "label"),
                    t("Growth was outrunning the spreadsheet", "h2"),
                    t(
                        "Every general manager built next week's schedule by hand on Sunday night. Forecasts were a guess, overtime was a surprise, and a sick line cook in Boston could not be covered by an off-shift cook two blocks away because no one could see who that was.",
                        "body",
                    ),
                    bullets(
                        "Labor ran 4–6 points over target in peak weeks",
                        "Managers spent 8+ hours a week building schedules",
                        "Shift swaps happened in group texts no one could audit",
                        "New-store openings took three managers off the floor",
                    ),
                ),
            ),
        ),
        section(
            "s5",
            callout(
                "warn",
                group(
                    t("The cost of standing still", "h3"),
                    t(
                        "An internal review put the bill at roughly $2.1M a year, most of it overtime that forecasting could have prevented, plus a 74% annual turnover rate fed by schedules that landed late and changed often. With six new locations on the calendar, doing nothing was the most expensive option on the table.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "s6",
            split(
                60,
                group(
                    t("The approach", "label"),
                    t("Pilot one city, then earn the rest", "h2"),
                    t(
                        "Rather than a top-down rollout, Tempo started where the pain was sharpest: the four Boston restaurants. We rebuilt their scheduling around demand forecasts drawn from three years of POS data, then let results, not a mandate, sell the other 18 locations.",
                        "body",
                    ),
                    diagram("process", "Audit, Pilot in Boston, Roll out by city, Optimize", 200),
                ),
                img(pic(227), 0.85),
            ),
        ),
        section(
            "s7",
            split(
                40,
                img(pic(228), 1.05),
                group(
                    t("The solution", "label"),
                    t("One platform, from forecast to clock-out", "h2"),
                    t(
                        "Tempo gave every manager a demand forecast, an auto-built schedule they could adjust in minutes, and a mobile app where the whole company could pick up open shifts. The floor stopped guessing and started planning.",
                        "body",
                    ),
                    bullets(
                        "Sales-driven forecasts auto-build the first draft of every schedule",
                        "A shared shift marketplace lets staff cover across all 22 locations",
                        "Live labor-vs-target alerts catch overtime before it happens",
                        "One-tap onboarding flows stood up each new store in days",
                    ),
                ),
            ),
        ),
        section(
            "s8",
            group(
                t("The results", "label"),
                t("Twelve months in", "h2"),
                t(
                    "Inside a year, the numbers that had been drifting the wrong way reversed, and the six new restaurants opened on schedule, staffed from day one.",
                    "subtitle",
                ),
                table(
                    "Metric,Before Tempo,After 12 months,Change\nLabor as % of sales,29.4%,24.1%,−18%\nManager hours on scheduling,8.2 / wk,1.6 / wk,−80%\nAnnual staff turnover,74%,49%,−25 pts\nNew-store time to fully staffed,6 weeks,9 days,−79%",
                ),
            ),
        ),
        section(
            "s9",
            group(
                row(
                    { align: "baseline", gap: 10 },
                    fitW(t("$2.4M", "h1")),
                    t("in annualized savings across the group.", "h2"),
                ),
                row(
                    stat("−18%", "labor cost as a share of sales"),
                    stat("+31", "points of manager satisfaction (eNPS)"),
                ),
            ),
        ),
        section(
            "s10",
            split(
                60,
                group(
                    t("The results", "label"),
                    t("Labor found its level", "h2"),
                    t(
                        "The line below is labor as a percentage of sales, month by month across the rollout. As each city came onto Tempo, the cost curve bent, and then held, even through the holiday rush and the six openings.",
                        "body",
                    ),
                ),
                group(
                    chart("line", "29.4, 28.8, 27.9, 27.1, 26.2, 25.4, 24.9, 24.1", 280),
                    t("Labor as % of sales, monthly across the engagement", "caption"),
                ),
            ),
        ),
        section(
            "s11",
            quote(
                "I got my Sundays back, and my GMs got their floors back. Tempo didn't just save us money. It let us open six restaurants without losing the thing that makes Marlow, Marlow.",
                "Daniela Marlow, Chief Operating Officer, Marlow Hospitality Group",
            ),
            { background: bgImage(pic(229, 1700, 1100), 0.6) },
        ),
        section(
            "s12",
            split(
                60,
                group(
                    t("The takeaway", "label"),
                    t("Managers back on the floor", "h2"),
                    t(
                        "Marlow proved what we believe at Tempo: hospitality scales when the back office disappears. Give managers a forecast and a shared workforce, and they'll spend their hours where guests can feel them. See what a 30-minute walkthrough could find in your labor line.",
                        "subtitle",
                    ),
                    button("Book a demo"),
                ),
                img(pic(230), 0.9),
            ),
        ),
    ],
    bgImage("https://images.pexels.com/photos/4790056/pexels-photo-4790056.jpeg", 0.3),
);

export const researchReport: ArtifactContent = doc(
    "studio",
    [
        section(
            "s1",
            group(
                t("RESEARCH REPORT · THE STATE OF REMOTE WORK 2026", "label"),
                t("Where Work Lives Now", "h1"),
                t(
                    "Six years after the office emptied, the question is no longer whether knowledge work can happen anywhere: it's where it happens best, and what that means for the people, places, and companies caught in between.",
                    "subtitle",
                ),
                t(
                    "Northwind Institute for Work · Annual Survey, sixth edition · June 2026",
                    "caption",
                ),
                badge("11,400 KNOWLEDGE WORKERS · 38 COUNTRIES · 6 INDUSTRIES"),
            ),
            { background: bgImage(pic(231, 1700, 1100), 0.55) },
        ),
        section(
            "s2",
            split(
                60,
                group(
                    t("Executive summary", "label"),
                    t("Hybrid won, but nobody agrees what it means.", "h2"),
                    t(
                        "The headline of 2026 is settlement, not revolution. The fully-remote surge has cooled and the return-to-office mandates have plateaued; what's left is a durable, messy middle. Fifty-four percent of knowledge workers now split their week between home and an office, and almost none of them define that split the same way.",
                        "subtitle",
                    ),
                    t(
                        "Across 11,400 respondents we found that flexibility has become the single strongest predictor of retention, outranking pay growth for the first time in the survey's history. But the same flexibility that keeps people is quietly fragmenting how teams collaborate, mentor, and belong. The companies pulling ahead are not the most remote or the most in-person; they are the most deliberate.",
                        "body",
                    ),
                    t(
                        "This report lays out what changed in the past year, what the data says about productivity and presence, and what we believe the next phase of distributed work requires.",
                        "body",
                    ),
                ),
                img(pic(232), 0.82),
            ),
        ),
        section(
            "s3",
            split(
                40,
                img(pic(233), 1.05),
                group(
                    t("Methodology", "label"),
                    t("How we ran the study", "h2"),
                    t(
                        "Between February and April 2026 the Northwind Institute surveyed 11,400 full-time knowledge workers and conducted 84 structured interviews with people leaders. Respondents span six industries (technology, finance, healthcare, media, professional services, and the public sector) across 38 countries, weighted to reflect each market's knowledge-economy workforce.",
                        "body",
                    ),
                    bullets(
                        "11,400 survey responses, margin of error ±1.1 points",
                        "84 qualitative interviews with managers and HR leaders",
                        "Six industries, weighted to national workforce data",
                        "Productivity self-reports validated against 1,900 anonymized output logs",
                        "Year-over-year trends benchmarked to the 2021–2025 editions",
                    ),
                ),
            ),
        ),
        section(
            "s4",
            group(
                t("Key findings", "label"),
                t("Four findings, and one warning", "h2"),
                t(
                    "The numbers this year tell a coherent story: the location debate is over, the calendar debate has just begun. Four findings follow, then the one result that should worry anyone managing early-career staff.",
                    "subtitle",
                ),
            ),
        ),
        section(
            "s5",
            split(
                60,
                group(
                    t("Finding 01 · Where work happens", "label"),
                    t("The week is split, not the workforce", "h2"),
                    t(
                        "Hybrid is no longer a transitional state on the way back to the office. It is the destination. A majority now work in a blended pattern, while fully-remote roles held steady and fully-in-office work continued its slow decline. The interesting movement is inside hybrid: the median in-office stint fell from 3.0 days to 2.4.",
                        "body",
                    ),
                    stat("2.4 days", "median time in-office per week among hybrid workers"),
                ),
                group(
                    chart("pie", "54, 27, 19", 280),
                    t(
                        "Work pattern: hybrid 54% · fully remote 27% · fully in-office 19%",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s6",
            row(
                stat("+11%", "self-reported focus-work output vs. a fully in-office baseline"),
                stat("72 min", "average daily commute time reclaimed by remote-capable staff"),
                stat("1 in 3", "managers who say measuring output still relies on presence"),
            ),
        ),
        section(
            "s7",
            split(
                40,
                img(pic(234), 1.05),
                group(
                    t("Finding 02 · The office's new job", "label"),
                    t("Buildings became meeting rooms", "h2"),
                    t(
                        "When people come in, they come in to be together. The share of office time spent in scheduled collaboration jumped sharply, while solo desk work (the thing offices were built for) migrated home. The implication for real estate is stark: companies need less square footage but far more of it configured for groups.",
                        "body",
                    ),
                    chart("column", "31, 44, 58, 67", 220),
                    t("Share of office hours spent in collaboration, 2023→2026", "caption"),
                ),
            ),
        ),
        section(
            "s8",
            group(
                t("Finding 03 · The geography of talent", "label"),
                quote(
                    "We stopped hiring from a forty-mile radius and started hiring from a forty-country one. Our best engineer last year lives three time zones from anyone she works with.",
                    "Priya Raghunathan, VP of Engineering, interviewed for this report",
                ),
                t(
                    "Remote-capable employers now draw 41% of new hires from outside their headquarters metro, up from 12% in 2020. Talent is dispersing toward lower-cost cities and toward the lives people actually want, and the firms that embraced distributed hiring report the widest candidate pools and the shortest time-to-fill.",
                    "body",
                ),
            ),
            { background: bgImage(pic(235, 1700, 1100), 0.6) },
        ),
        section(
            "s9",
            group(
                t("Finding 04 · The trade-offs, side by side", "label"),
                t("No model wins on every axis", "h2"),
                t(
                    "When we hold output, retention, mentorship, and cost up against each other, each working model trades one strength for another. Hybrid leads on retention and balance; fully-remote leads on cost and reach; in-office still leads on early-career mentorship. There is no free lunch, only an honest choice about what a team needs most.",
                    "body",
                ),
                table(
                    "Dimension,Fully in-office,Hybrid,Fully remote\nFocus-work output,Baseline,+11%,+14%\n12-month retention,81%,89%,84%\nEarly-career mentorship,Strong,Moderate,Weak\nReal-estate cost / head,$11.2k,$6.4k,$1.9k\nReported belonging,High,High,Moderate",
                ),
            ),
        ),
        section(
            "s10",
            split(
                60,
                callout(
                    "warn",
                    group(
                        t("Implications · The proximity gap", "label"),
                        t("Mentorship is the quiet casualty", "h3"),
                        t(
                            "The clearest warning in the data concerns people in their first three years of work. Junior staff in fully-remote roles reported 28% fewer informal coaching moments and were promoted, on average, four months later than in-office peers. Flexibility is a benefit the experienced enjoy and the inexperienced often pay for, unless mentorship is designed in on purpose.",
                            "body",
                        ),
                    ),
                ),
                img(pic(236), 0.85),
            ),
        ),
        section(
            "s11",
            group(
                t("Recommendations", "label"),
                t("What deliberate distributed work looks like", "h2"),
                t(
                    "The companies thriving in 2026 treat flexibility as an operating model to be designed, not a perk to be granted. Five practices separated the leaders from the strugglers in our data.",
                    "subtitle",
                ),
                bullets(
                    "Anchor days, not mandates: coordinate when teams overlap, don't police where they sit",
                    "Make the office a collaboration venue, then size and shape the space for that one job",
                    "Write decisions down by default so presence stops being a prerequisite for influence",
                    "Engineer mentorship explicitly: pair, sponsor, and review on a schedule, not by chance",
                    "Measure outcomes, never hours; retire any metric that rewards being seen",
                ),
                diagram("process", "Set anchors, Document, Pair & sponsor, Measure outcomes", 200),
            ),
            { background: bgImage(pic(237, 1700, 1100), 0.6) },
        ),
        section(
            "s12",
            group(
                t(
                    "The office is no longer the workplace; it is one tool among several for doing work together. The organizations that say this out loud, and redesign around it, are quietly building the most resilient, far-reaching, and loyal teams we have measured in six years of this study.",
                    "subtitle",
                ),
            ),
        ),
        section(
            "s13",
            split(
                60,
                group(
                    t("About the research", "label"),
                    t("Northwind Institute for Work", "h3"),
                    t(
                        "The Northwind Institute is an independent research body studying how work is changing. The State of Remote Work is its longest-running annual study, first published in 2021. This edition was authored by Dr. Lena Halvorsen and the Future of Work team, with fieldwork by Halden Research Partners. Full datasets and methodology notes are available at northwind.org/remote-2026.",
                        "body",
                    ),
                    t(
                        "© 2026 Northwind Institute for Work · Oslo & Toronto · CC BY-NC 4.0",
                        "caption",
                    ),
                    button("Download the full dataset"),
                ),
                img(pic(238), 0.82),
            ),
        ),
    ],
    bgImage("https://images.pexels.com/photos/36346049/pexels-photo-36346049.jpeg", 0.3),
);

export const marketAnalysis: ArtifactContent = doc(
    "press",
    [
        section(
            "s1",
            group(
                t("MARKET ANALYSIS · 2026 OUTLOOK", "label"),
                t("Charging the Transition", "h1"),
                t(
                    "The plug is the new pump. As electric vehicles cross from early adopters to the mainstream, the race to power them is becoming one of the decade's largest infrastructure build-outs, and one of its most contested markets.",
                    "subtitle",
                ),
                t("Meridian Research · Global EV Infrastructure Practice · June 2026", "caption"),
                badge("GLOBAL · PUBLIC + HOME CHARGING · 2026–2032 FORECAST"),
            ),
            { background: bgImage(pic(239, 1700, 1100), 0.55) },
        ),
        section(
            "s2",
            group(
                t("The market at a glance", "label"),
                t("Three numbers that frame the sector", "h2"),
                t(
                    "Before the segments and the players, start here: how big the market is, how fast it's growing, and how much hardware is already in the ground.",
                    "subtitle",
                ),
            ),
        ),
        section(
            "s3",
            row(
                stat("$34.2B", "global EV charging market in 2025"),
                stat("23.6%", "projected CAGR through 2032"),
                stat("4.1M", "public charge points installed worldwide"),
            ),
        ),
        section(
            "s4",
            split(
                60,
                group(
                    t("Market size & growth", "label"),
                    t("A market compounding above 20% a year", "h2"),
                    t(
                        "The EV charging market has grown roughly fourfold since 2021 and shows no sign of slowing. Vehicle parc is the engine: every new EV on the road creates years of downstream demand for energy, hardware, and services. On our base case the market reaches $148B by 2032, with the steepest gains in DC fast charging and managed home charging.",
                        "body",
                    ),
                    stat("$148B", "projected market size by 2032, base case"),
                ),
                group(
                    chart("line", "9, 13, 19, 26, 34, 44, 56", 300),
                    t("Global market revenue, $B, 2021–2027E", "caption"),
                ),
            ),
        ),
        section(
            "s5",
            group(
                t("Segments", "label"),
                t("Where the dollars sit, and where they're moving", "h2"),
                t(
                    "The market splits along charging speed and location. Level 2 AC charging dominates by unit volume (it's what sits in homes and workplaces) but ultra-fast DC is capturing revenue share fastest as highway corridors and fleets electrify. Home charging, long an afterthought, is becoming a managed-energy business in its own right.",
                    "body",
                ),
                table(
                    "Segment,2025 revenue,Share,2025–2032 CAGR\nLevel 2 AC (home),$11.6B,34%,21%\nLevel 2 AC (public/work),$7.2B,21%,18%\nDC fast (50–150kW),$8.1B,24%,26%\nUltra-fast (>150kW),$5.5B,16%,31%\nFleet & depot,$1.8B,5%,29%",
                ),
                chart("column", "11.6, 7.2, 8.1, 5.5, 1.8", 240),
                t("2025 revenue by segment, $B", "caption"),
            ),
        ),
        section(
            "s6",
            row(
                card(
                    img(pic(240), 1),
                    t("Voltline Networks", "h3"),
                    t(
                        "The volume leader in public Level 2, with ~190k connectors and a software platform others license.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(241), 1),
                    t("AmpGrid", "h3"),
                    t(
                        "Pure-play ultra-fast operator betting on highway corridors and 350kW megawatt-ready sites.",
                        "caption",
                    ),
                ),
                card(
                    img(pic(242), 1),
                    t("Hyperion (OEM)", "h3"),
                    t(
                        "An automaker's captive network now opening to other brands: distribution as a moat.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "s7",
            split(
                40,
                img(pic(243), 1.05),
                group(
                    t("Competitive landscape", "label"),
                    t("Four ways players are trying to win", "h2"),
                    t(
                        "The field is crowded and consolidating at the same time. Differentiation is moving away from hardware (increasingly commoditized) and toward uptime, energy economics, and the driver experience.",
                        "body",
                    ),
                    bullets(
                        "Reliability · guaranteed uptime is becoming the headline SLA buyers pay for",
                        "Energy arbitrage · on-site batteries and smart load management protect margins",
                        "Network density · winning corridors and fleets before rivals plant hardware",
                        "Software & roaming · one app, one payment, every network is the experience play",
                    ),
                ),
            ),
        ),
        section(
            "s8",
            group(
                t("Trends", "label"),
                t("What's reshaping the next five years", "h2"),
                t(
                    "Five forces are pulling the market forward and changing what a charging site is. The endpoint isn't a parking lot full of plugs. It's a distributed energy asset that happens to charge cars.",
                    "subtitle",
                ),
                diagram(
                    "process",
                    "Plug-and-charge, Megawatt charging, Battery-buffered sites, V2G pilots, Charging-as-a-service",
                    200,
                ),
            ),
            { background: bgImage(pic(244, 1700, 1100), 0.5) },
        ),
        section(
            "s9",
            row(
                callout(
                    "success",
                    group(
                        t("Opportunities", "label"),
                        t("Where the upside concentrates", "h3"),
                        bullets(
                            "Fleet & depot electrification · sticky, high-utilization contracts",
                            "Reliability-as-a-product for networks battling a trust deficit",
                            "Software, payments, and roaming layers that ride on anyone's hardware",
                            "Behind-the-meter storage that turns volatile power prices into margin",
                        ),
                    ),
                ),
                callout(
                    "caution",
                    group(
                        t("Risks", "label"),
                        t("What could stall the curve", "h3"),
                        bullets(
                            "Utilization risk · too many stalls chasing too few sessions early",
                            "Grid interconnection delays of 12–24 months in key metros",
                            "Subsidy dependence as public incentives taper after 2027",
                            "Standards fragmentation slowing the seamless-roaming promise",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "s10",
            quote(
                "The winners won't be whoever pours the most concrete. They'll be whoever keeps the most plugs working, at the lowest cost of energy, with the fewest taps to pay.",
                "Marcus Idowu, Partner, Meridian Research",
            ),
            { background: bgImage(pic(245, 1700, 1100), 0.6) },
        ),
        section(
            "s11",
            split(
                60,
                group(
                    t("Outlook", "label"),
                    t("Our base case: $148B and a flight to quality", "h2"),
                    t(
                        "We expect the market to keep compounding above 20% through 2032, but the easy growth phase is ending. As utilization matures, capital will reward operators with reliable hardware, smart energy stacks, and real network density, and punish those who built for subsidies rather than sessions. Expect consolidation to accelerate from 2027 as the long tail of sub-scale networks is acquired or shut.",
                        "body",
                    ),
                    stat("23.6%", "base-case CAGR, 2025–2032"),
                ),
                img(pic(246), 0.9),
            ),
        ),
        section(
            "s12",
            group(
                t(
                    "Meridian Research is an independent technology and infrastructure research firm. This analysis draws on operator filings, our proprietary connector database, and 40 industry interviews. Full segment models and the bull/bear scenarios are available to subscribers at meridian.research/ev-2026.",
                    "caption",
                ),
            ),
        ),
    ],
    bgImage("https://images.pexels.com/photos/5052445/pexels-photo-5052445.jpeg", 0.3),
);

export const qbr: ArtifactContent = doc(
    "studio",
    [
        section(
            "q1",
            group(
                t("TESSERA · QUARTERLY BUSINESS REVIEW", "label"),
                t("Q2 FY2026 in Review", "h1"),
                t(
                    "A strong quarter on revenue, a soft one on new logos, and a clear read on what to fix before Q3. The numbers, the wins, the misses, and the four decisions we need from this room.",
                    "subtitle",
                ),
                t(
                    "Prepared by the Tessera leadership team · For the Board & Executive Staff · June 2026",
                    "caption",
                ),
                t("ARR $48.6M · NRR 119% · 612 customers", "caption"),
            ),
            {
                background: bgImage(pic(247, 1700, 1100), 0.58),
            },
        ),

        section(
            "q2",
            split(
                60,
                group(
                    t("The quarter at a glance", "label"),
                    row(
                        { align: "baseline", gap: 10 },
                        fitW(t("113%", "h1")),
                        t("of plan on revenue, and a miss on reach.", "h2"),
                    ),
                    t(
                        "Q2 was our best revenue quarter ever and our slowest new-logo quarter in a year, at the same time. Existing customers expanded faster than we modeled, carrying net new ARR to 113% of plan. But the top of the funnel cooled: enterprise cycles stretched, the SDR class ramped slowly, and we closed 84 of the 95 new logos we forecast.",
                        "subtitle",
                    ),
                    t(
                        "The shape of the business is healthy. The shape of the pipeline is the risk. This review walks the scorecard top to bottom, names what slipped without flinching, and ends with four asks that determine whether Q3 holds the line on growth.",
                        "body",
                    ),
                ),
                group(
                    img(pic(248), 0.82, 10),
                    t(
                        "Q2 in close-up: revenue ahead of plan, reach behind it, and four decisions at the end.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "q3",
            row(
                stat("$5.1M", "net new ARR · 113% of plan"),
                stat("119%", "net revenue retention, up 4 pts QoQ"),
                stat("81%", "gross margin, holding above target"),
            ),
        ),

        section(
            "q4",
            group(
                t("Scorecard", "label"),
                t("KPIs vs. targets", "h2"),
                t(
                    "Six metrics define the quarter. Four beat or held; two missed. The pattern is consistent: anything driven by our installed base outperformed, and anything driven by new acquisition came in light.",
                    "body",
                ),
                table(
                    "Metric,Target,Actual,Status\n" +
                        "Net new ARR,$4.5M,$5.1M,Beat\n" +
                        "Net revenue retention,115%,119%,Beat\n" +
                        "New logos,95,84,Miss\n" +
                        "Gross margin,80%,81%,On track\n" +
                        "CAC payback,14 mo,16 mo,Miss\n" +
                        "Net promoter score,45,52,Beat",
                ),
            ),
        ),

        section(
            "q5",
            split(
                60,
                group(
                    t("Revenue & pipeline", "label"),
                    t("ARR keeps compounding; coverage is thinning.", "h2"),
                    t(
                        "ARR crossed $48.6M, our sixth straight quarter of double-digit sequential growth, driven almost entirely by expansion. The concern sits one layer down: qualified pipeline entering Q3 is 3.2x of target, below our 4.0x guardrail. We are not short on revenue today. We are short on the future quarters' worth of it.",
                        "body",
                    ),
                    stat("3.2x", "Q3 pipeline coverage vs. 4.0x guardrail"),
                ),
                group(
                    chart("line", "30, 34, 38, 42, 45, 49", 300),
                    t("Ending ARR by quarter, $M, Q1 FY25 – Q2 FY26", "caption"),
                ),
            ),
        ),

        section(
            "q6",
            split(
                40,
                group(
                    img(pic(249), 1.05, 10),
                    t(
                        "Northwind Bank went live on Tessera in six weeks, a new record for a Tier 1 account.",
                        "caption",
                    ),
                ),
                group(
                    t("What went right", "label"),
                    t("Four wins worth repeating", "h2"),
                    bullets(
                        "Closed Northwind Bank at $1.2M ARR, our largest new logo ever and a reference account in financial services.",
                        "Shipped Tessera Flow to GA; 38% of active customers adopted it within three weeks of launch.",
                        "Earned SOC 2 Type II, unblocking nine enterprise deals that had been gated on it.",
                        "Expanded Cobalt Health from two business units to seven, a $640K upsell closed a quarter early.",
                    ),
                ),
            ),
        ),

        section(
            "q7",
            quote(
                "Our installed base is doing the work of a sales team we haven't hired yet. That's a gift and a warning.",
                "Priya Nandakumar, Chief Revenue Officer",
            ),
            { background: bgImage(pic(250, 1700, 1100), 0.6) },
        ),

        section(
            "q8",
            group(
                t("What slipped", "label"),
                t("Three things we missed, and why", "h2"),
                callout(
                    "caution",
                    group(
                        t("NEW-LOGO SHORTFALL", "label"),
                        t(
                            "We closed 84 of 95 forecast new logos. Two-thirds of the gap traces to enterprise deals slipping a quarter as security review queued behind our SOC 2 cycle; the rest to an SDR class that ramped roughly five weeks slower than the last. Neither is structural, but both are now in the Q3 plan as named risks.",
                            "body",
                        ),
                    ),
                ),
                t(
                    "Two more slips worth naming plainly: Reverse ETL, promised for May GA, moved to Q3 after a data-residency rework. It cost us at least two competitive evaluations. And CAC payback drifted to 16 months against a 14-month target, a direct consequence of spending into a funnel that converted slower than planned.",
                    "body",
                ),
            ),
        ),

        section(
            "q9",
            split(
                60,
                group(
                    t("Customer health", "label"),
                    t("Retention is strong; a few whales need watching.", "h2"),
                    t(
                        "Gross retention held at 94% and NPS climbed to 52, its highest reading since we began tracking it. Support CSAT sits at 4.6/5. The watch list is short but heavy: three accounts representing $2.1M of ARR are mid-renewal with new economic buyers, and all three are now under direct executive sponsorship.",
                        "body",
                    ),
                    quote(
                        "Tessera quietly became the system the rest of our stack reports into. We'd feel its absence in a day.",
                        "Director of Data Platform, Cobalt Health",
                    ),
                ),
                group(
                    chart("line", "111, 113, 115, 117, 119", 260),
                    t("Net revenue retention by quarter, %", "caption"),
                ),
            ),
        ),

        section(
            "q10",
            group(
                t("Looking ahead", "label"),
                t("Priorities for Q3", "h2"),
                t(
                    "One quarter, five moves. Each maps directly to a gap above, and the plan is to fix what slipped without slowing what's working.",
                    "body",
                ),
                bullets(
                    "Rebuild pipeline coverage to 4.0x by mid-quarter: protect outbound spend, accelerate the partner-sourced channel.",
                    "Ship Reverse ETL to GA in week six; win back the two stalled evaluations it cost us.",
                    "Fully ramp the new SDR class and stand up a dedicated enterprise security-review fast lane.",
                    "Pull CAC payback back toward 14 months by reweighting spend to the segments that convert.",
                    "Lock the three at-risk renewals early, ahead of their economic-buyer transitions.",
                ),
            ),
        ),

        section(
            "q11",
            card(
                t("The asks", "label"),
                t("Four decisions we need from this room", "h2"),
                bullets(
                    "Approve six incremental enterprise AE hires, front-loaded into July to protect H2 capacity.",
                    "Release the $400K field-marketing budget to refill top-of-funnel ahead of Q3.",
                    "Sponsor the three strategic renewals at board level: intros where you have them.",
                    "Sign off on the usage-based pricing change for the mid-market tier, effective August 1.",
                ),
                button("Approve the Q3 plan"),
            ),
        ),

        section(
            "q12",
            t(
                "The business is compounding from the inside out. The work now is to make sure the next twelve months of new customers are as healthy as this quarter's revenue. We have the team, the product, and the plan. We need the four yeses above to run it.",
                "subtitle",
            ),
            { background: bgImage(pic(251, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(252, 1700, 1100), 0.35),
);

export const trendsReport: ArtifactContent = doc(
    "studio",
    [
        section(
            "t1",
            group(
                t("INDUSTRY TRENDS REPORT · 2026", "label"),
                t("The Factory Wakes Up", "h1"),
                t(
                    "For thirty years the industrial robot was a caged, single-purpose machine bolted to a floor. In 2026 it is becoming something else: cheaper, sighted, rentable, and increasingly able to share the room with people. This is the year automation stopped being a project and started being a default.",
                    "subtitle",
                ),
                t("Continuum Research · Automation & Robotics Practice · June 2026", "caption"),
                badge("420 MANUFACTURERS SURVEYED · 11 SECTORS · 19 COUNTRIES"),
            ),
            { background: bgImage(pic(253, 1700, 1100), 0.58) },
        ),

        section(
            "t2",
            split(
                60,
                group(
                    t("The landscape today", "label"),
                    t("Automation crossed from the margins to the mainstream.", "h2"),
                    t(
                        "The story of industrial robotics used to be a story about cars, about heavy arms welding chassis in a handful of giant plants. That era hasn't ended, but it has been overtaken. The fastest growth now comes from electronics, logistics, food, and metals, and from companies with under five hundred employees that could never have justified automation a decade ago.",
                        "subtitle",
                    ),
                    t(
                        "Three forces are converging: hardware costs are falling, perception software has gotten good enough to handle mess, and new financing models have erased the upfront capital wall. Together they are pulling robots out of the cage and into the kind of work that used to be considered too varied, too delicate, or too small-batch to automate.",
                        "body",
                    ),
                ),
                group(
                    img(pic(254), 0.82, 10),
                    t(
                        "The era this report leaves behind: fixed machines, fenced off, each doing one job.",
                        "caption",
                    ),
                ),
            ),
        ),

        section(
            "t3",
            row(
                stat("4.3M", "industrial robots operating worldwide"),
                stat("+12%", "annual installations, 2025 vs. 2024"),
                stat("$16.5B", "projected cobot market by 2030"),
            ),
        ),

        section(
            "t4",
            split(
                60,
                group(
                    t("Trend 01", "label"),
                    t("Collaborative robots go mainstream", "h2"),
                    t(
                        "Cobots (robots designed to work safely alongside people without a cage) have moved from novelty to backbone. They install in days rather than months, cost a fraction of traditional cells, and don't require a safety guard or a dedicated operator. In 2020 they were one in twelve new installations; on our forecast they cross one in three by 2027.",
                        "body",
                    ),
                    t(
                        "What changed is not the robots so much as the buyers. The marginal new customer in 2026 is a mid-sized job shop automating a single repetitive station (palletizing, machine tending, quality inspection) and expecting payback inside a year. Cobots are the only category that meets that bar.",
                        "body",
                    ),
                ),
                group(
                    chart("line", "9, 12, 16, 21, 27, 33", 300),
                    t("Cobots as a share of new robot installations, %, 2022–2027E", "caption"),
                ),
            ),
        ),

        section(
            "t5",
            split(
                40,
                group(
                    img(pic(255), 1.05, 10),
                    t(
                        "The camera became the fixture: the part no longer has to arrive in a known place.",
                        "caption",
                    ),
                ),
                group(
                    t("Trend 02", "label"),
                    t("Perception gets a brain", "h2"),
                    t(
                        "The hardest problem in automation was never motion. It was sight. A robot that can only repeat a memorized path is useless the moment a part arrives at the wrong angle. AI-driven vision changed that. Modern perception stacks identify, orient, and grasp jumbled parts from a bin in real time, a task that defeated automation for thirty years.",
                        "body",
                    ),
                    stat("10x", "improvement in vision-guided bin-picking success since 2021"),
                    t(
                        "The downstream effect is larger than the feature itself: once a robot can handle variability, the universe of automatable tasks expands dramatically, and the line between fixed automation and flexible labor begins to blur.",
                        "body",
                    ),
                ),
            ),
        ),

        section(
            "t6",
            split(
                60,
                group(
                    t("Trend 03", "label"),
                    t("Robots without the capital expense", "h2"),
                    t(
                        "Robotics-as-a-Service is doing to automation what cloud did to servers. Instead of a six-figure purchase and a multi-year depreciation schedule, manufacturers rent capacity by the month, with hardware, software, maintenance, and uptime guarantees bundled into a single operating-expense line. RaaS contracts signed grew more than tenfold in three years.",
                        "body",
                    ),
                    t(
                        "The model matters most for exactly the buyers who were previously locked out: smaller manufacturers without capital budgets or in-house robotics teams. It converts a daunting one-time bet into a cancelable subscription, and in doing so widens the market far faster than falling hardware prices alone could.",
                        "body",
                    ),
                ),
                group(
                    chart("column", "120, 340, 610, 980, 1520", 300),
                    t("RaaS contracts signed per year, 2021–2025", "caption"),
                ),
            ),
        ),

        section(
            "t7",
            group(
                t("Trend 04", "label"),
                t("The labor equation flips", "h2"),
                stat("1.9M", "U.S. manufacturing jobs projected to go unfilled by 2030"),
                t(
                    "For most of the last century automation was framed as a substitute for available labor. In 2026 it is increasingly a response to labor that simply isn't there. An aging workforce, tighter immigration, and a reshoring wave have left factories structurally short-staffed, and robots are filling the dull, dirty, and dangerous roles people no longer take. The political conversation about jobs is, on the factory floor, quietly inverting.",
                    "subtitle",
                ),
            ),
            { background: bgImage(pic(256, 1700, 1100), 0.62) },
        ),

        section(
            "t8",
            split(
                60,
                group(
                    t("Trend 05", "label"),
                    t("Humanoids cross from demo to pilot", "h2"),
                    t(
                        "The most hyped category is also the least proven, but in 2026 it stopped being only hype. General-purpose humanoid robots moved from staged demos to paid pilots inside real warehouses and plants, with announced deployments climbing from a handful in 2022 to roughly ninety this year. None are at scale, and the unit economics remain unproven.",
                        "body",
                    ),
                    t(
                        "Our read is to treat humanoids as a five-year bet, not a 2026 purchase. The near-term value is narrow (moving totes, tending machines, simple loading) and the durability and cost questions are real. But the trajectory is steep enough that no operations leader should let the category go un-watched.",
                        "body",
                    ),
                ),
                group(
                    chart("line", "3, 7, 18, 44, 90", 260),
                    t("Announced humanoid robot pilots, cumulative, 2022–2026", "caption"),
                ),
            ),
        ),

        section(
            "t9",
            quote(
                "The question on the floor is no longer whether to automate a task. It's which financing model and how soon, and that shift is the whole story of 2026.",
                "Lead Analyst, Continuum Automation Practice",
            ),
            { background: bgImage(pic(257, 1700, 1100), 0.6) },
        ),

        section(
            "t10",
            card(
                t("What it means for you", "label"),
                t("Reading the trends as an operator", "h2"),
                callout(
                    "tip",
                    group(
                        t("THE PRACTICAL TAKEAWAY", "label"),
                        t(
                            "If you run operations, the cost of waiting just went up. The combination of cheap cobots, working perception, and rentable capacity means the first automatable station in your plant probably pays back inside a year, and your competitors are doing the math too.",
                            "body",
                        ),
                    ),
                ),
                bullets(
                    "Start with one station, not a line. Pick a repetitive, single-task bottleneck and prove payback before scaling.",
                    "Pilot via RaaS to sidestep the capital case and learn before you commit hardware.",
                    "Insist on vision-guided flexibility: fixed automation ages badly as product mix changes.",
                    "Watch humanoids, but don't buy yet; budget attention this year, capital in two to three.",
                ),
            ),
        ),

        section(
            "t11",
            group(
                t("The outlook", "label"),
                t("Five predictions for the next five years", "h2"),
                t(
                    "Where the curves above point, with our confidence stated plainly. We will grade ourselves against these in next year's edition.",
                    "body",
                ),
                table(
                    "Prediction,Timeframe,Confidence\n" +
                        "Cobots exceed 40% of new installations,By 2028,High\n" +
                        "Vision-guided picking becomes standard on new cells,By 2027,High\n" +
                        "RaaS becomes the default for SMB automation,By 2029,Medium\n" +
                        "Robot density doubles in reshored U.S. plants,By 2031,Medium\n" +
                        "First single-site 10k-unit humanoid fleet deployed,By 2031,Low",
                ),
            ),
        ),

        section(
            "t12",
            group(
                divider(),
                t("Methodology", "label"),
                t(
                    "This report draws on a survey of 420 manufacturing operations leaders across eleven sectors and nineteen countries, fielded in March–April 2026, supplemented by global robot shipment data, RaaS-provider contract figures, and forty in-depth interviews with plant managers and automation integrators. Forecasts represent our base case; ranges and full segment data are available in the data appendix.",
                    "body",
                ),
                button("Request the full data appendix"),
                t(
                    "Continuum Research · Automation & Robotics Practice · Lead analyst: Dr. Elena Vasquez · © 2026",
                    "caption",
                ),
            ),
        ),
    ],
    bgImage(pic(258, 1700, 1100), 0.4),
);

// keyed by the same ids as @model/workspace's TEMPLATE_INDEX; a missing key is a 404, so the two
// must stay in sync (the index is the client-facing half, this is the body half)

// A between-row line: name left, value right, an optional note under. What a menu is (dishes and
// prices), and a concert program too (pieces and durations).
const dish = (name: string, price: string, note?: string): ElementInstance =>
    group(
        row({ justify: "between", align: "start" }, t(name, "h3"), fitW(t(price, "h3"))),
        ...(note ? [t(note, "caption")] : []),
    );

export const restaurantMenu: ArtifactContent = doc(
    "vellum",
    [
        section(
            "cover",
            group(
                t("THE QUINCE · PORTLAND", "label"),
                t("Dinner", "h1"),
                t(
                    "Late autumn. The menu changes when the farms do; this one is three weeks old and proud of it.",
                    "subtitle",
                ),
                t("5:30 to 10, Tuesday through Sunday · 1214 SE Ankeny", "caption"),
            ),
            { background: bgImage(pic(259, 1700, 1100), 0.6) },
        ),
        section(
            "note",
            group(
                w(
                    58,
                    group(
                        t("FROM THE KITCHEN", "label"),
                        t(
                            "Nearly everything on this page was grown within forty miles of the room you are sitting in. The menu is short because the walk-in is honest: when the last of the delicata goes, so does the dish. Ask about anything; the kitchen likes talking.",
                            "body",
                        ),
                        t("June Aldana, chef & owner", "caption"),
                    ),
                ),
                pin(
                    w(
                        30,
                        polaroid(pic(260, 900, 1100), 0.82, "The larder, photographed on Tuesday."),
                    ),
                    "end",
                    "center",
                    { dx: -16, rotate: -3, z: 1 },
                ),
            ),
        ),
        section(
            "starters",
            group(
                t("TO START", "label"),
                dish("Sourdough, cultured butter", "7"),
                dish("Charred leeks, romesco, hazelnut", "14"),
                dish("Chicories, anchovy, pecorino, breadcrumb", "15"),
                dish("Squash agnolotti, brown butter, sage", "19", "add shaved truffle for 9"),
                dish("Albacore crudo, quince, chili oil", "18"),
            ),
        ),
        section(
            "farms",
            group(
                t("THE FARMS", "label"),
                t("Three farms, forty miles.", "h2"),
                t(
                    "Winterspring on Sauvie Island grows the greens and roots. Broken Fence in Yamhill raises the pork and the eggs. The fruit comes from Quince Hill above Hood River, the orchard that named the room.",
                    "body",
                ),
            ),
            { background: bgImage(pic(261, 1700, 1100), 0.55) },
        ),
        section(
            "mains",
            group(
                t("MAINS", "label"),
                dish("Half chicken, schmaltz potatoes, salsa verde", "29"),
                dish("Whole trout, brown butter, capers, lemon", "32"),
                dish("Pork chop, braised cabbage, mustard, apple", "34"),
                dish("Mushroom cavatelli, garlic confit, parmesan", "26"),
                dish("Coulotte steak, charred onion, marrow butter", "38", "for two, add 30"),
            ),
        ),
        section(
            "dessert",
            group(
                t("TO FINISH", "label"),
                dish("Quince tarte tatin, crème fraîche", "12"),
                dish("Chocolate pot de crème, olive oil, salt", "11"),
                dish("Affogato", "8"),
                dish("Coffee, batch or espresso", "4"),
                dish("Amaro, rotating shelf", "9"),
                dish("Tea from the jars on the wall", "5"),
            ),
        ),
        section(
            "wine",
            group(
                t("WINE", "label"),
                t("Short list, long thought.", "h2"),
                table(
                    "Wine,Glass,Bottle\nGamay · Willamette,14,52\nMelon · Loire,13,48\nNerello · Etna,15,58\nChenin pét-nat · Anjou,14,50\nOloroso · Jerez,9,36",
                ),
                t("The full cellar list lives in a binder; ask and it appears.", "caption"),
            ),
        ),
        section(
            "aperitifs",
            group(
                t("BEFORE DINNER", "label"),
                dish("House vermouth, orange, olives", "9"),
                dish("Sherry flight · three pours", "14"),
                dish("The Quince 75 · with our quince shrub", "13"),
            ),
        ),
        section(
            "larder",
            split(
                60,
                group(
                    t("THE LARDER", "label"),
                    t("Take the good stuff home.", "h2"),
                    dish("The chili oil", "12", "The jar people write about; ships nowhere, sorry"),
                    dish("Quince membrillo", "9", "From the orchard that named the room"),
                    dish("Sourdough loaf", "8", "Fridays only · reserve with dinner"),
                ),
                img(pic(262), 0.82),
            ),
        ),
        section(
            "close",
            group(
                t("Corkage 25 · No cake fee, bring the cake", "h3"),
                t(
                    "A 20% service charge is included, and all of it goes to the whole team.",
                    "caption",
                ),
                linked(
                    "caption",
                    "Reservations: ",
                    ["thequince.com", "https://thequince.com"],
                    " · ",
                    ["(503) 555-0177", "tel:+15035550177"],
                    " · ",
                    ["hello@thequince.com", "mailto:hello@thequince.com"],
                ),
            ),
            { background: bgImage(pic(263, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(264, 1700, 1100), 0.3),
);

export const travelItinerary: ArtifactContent = doc(
    "graphite",
    [
        section(
            "cover",
            group(
                t("TRIP PLAN · OCTOBER 12 TO 17", "label"),
                t("Five Days Around Iceland", "h1"),
                t(
                    "A ring-road plan for two: waterfalls before breakfast, black sand by noon, and a hot pool at the end of every drive.",
                    "subtitle",
                ),
                t("Reykjavík to Vík to Höfn and back · 1,340 km", "caption"),
            ),
            { background: bgImage(pic(265, 1700, 1100), 0.5) },
        ),
        section(
            "overview",
            row(
                stat("5", "days on the road"),
                stat("1,340 km", "of ring road"),
                stat("7", "waterfalls, minimum"),
            ),
        ),
        section(
            "day1",
            split(
                40,
                img(pic(266), 1.05),
                group(
                    t("DAY 1 · SUNDAY", "label"),
                    t("Land, float, recover.", "h2"),
                    t(
                        "The flight lands at 6:40. Pick up the car, drive twenty minutes, and let the jet lag dissolve in milk-blue water before the country is properly awake. Into the city by two: check in, walk the harbor, eat something warm, sleep early.",
                        "body",
                    ),
                    t("Drive 98 km · Stay: Reykjavík, two nights", "caption"),
                ),
            ),
        ),
        section(
            "day2",
            split(
                60,
                group(
                    t("DAY 2 · MONDAY", "label"),
                    t("The Golden Circle, before the buses.", "h2"),
                    t(
                        "Leave at seven and do the loop in the quiet: the rift valley at Þingvellir, Geysir mid-eruption if it obliges, and Gullfoss loud enough to end conversation. Lunch at the tomato greenhouse, then the slow road home past the horses.",
                        "body",
                    ),
                    t("Drive 240 km · Stay: Reykjavík", "caption"),
                ),
                img(pic(267), 0.82),
            ),
        ),
        section(
            "day3",
            group(
                t("DAY 3 · TUESDAY", "label"),
                t("South, into waterfall country.", "h2"),
                t(
                    "The best single day of road in the country. Walk behind Seljalandsfoss and take the soaking, climb the steps at Skógafoss for the rainbow, then the black sand at Reynisfjara with the stacks offshore. Sleep in Vík under the church hill.",
                    "body",
                ),
            ),
            { background: bgImage(pic(268, 1700, 1100), 0.5) },
        ),
        section(
            "day3-stops",
            row(
                group(
                    img(pic(269), 0.8),
                    t("Seljalandsfoss: the path goes behind the water.", "caption"),
                ),
                group(
                    img(pic(270), 0.8),
                    t("The Sólheimasandur wreck, an hour's flat walk each way.", "caption"),
                ),
                group(
                    img(pic(271), 0.8),
                    t("Reynisdrangar from the beach. Respect the sneaker waves.", "caption"),
                ),
            ),
        ),
        section(
            "day4",
            split(
                40,
                img(pic(272), 1.05),
                group(
                    t("DAY 4 · WEDNESDAY", "label"),
                    t("Glacier lagoon and the long light.", "h2"),
                    t(
                        "East along the sands to Jökulsárlón, where the icebergs drift out to meet the tide and wash back up on the black beach like cut glass. Langoustine in Höfn for dinner; the harbor shack, not the fancy one.",
                        "body",
                    ),
                    t("Drive 272 km · Stay: Höfn", "caption"),
                ),
            ),
        ),
        section(
            "day5",
            split(
                60,
                group(
                    t("DAY 5 · THURSDAY", "label"),
                    t("The long way back.", "h2"),
                    t(
                        "Retrace the coast with the light going the other way, which makes it a different road. Stop where yesterday said no. A hot dog at the famous stand when the city returns, one last pool, pack the salt-crusted boots.",
                        "body",
                    ),
                    t("Drive 456 km · Stay: Reykjavík · Flight out 10:50", "caption"),
                ),
                img(pic(273), 0.82),
            ),
        ),
        section(
            "aurora",
            group(
                w(62, t("Every clear night is an aurora night.", "h2")),
                w(
                    62,
                    t(
                        "Check the forecast at vedur.is; above Kp 4, drive out past the streetlights, cut the engine, and look north for twenty minutes before deciding it isn't happening.",
                        "caption",
                    ),
                ),
                pin(
                    w(
                        24,
                        polaroid(
                            pic(274, 900, 700),
                            1.28,
                            "What Kp 4 looked like from the hot tub.",
                        ),
                    ),
                    "end",
                    "center",
                    {
                        dx: -24,
                        rotate: 4,
                        z: 1,
                    },
                ),
            ),
            { background: bgImage(pic(275, 1700, 1100), 0.45) },
        ),
        section(
            "bookings",
            group(
                t("BOOKINGS", "label"),
                table(
                    "Booking,Reference,Note\nFlights FI 642 / FI 643,KX93JX,Bags checked both ways\nHouse in Reykjavík,BNB-88214,Self check-in after 3\nGuesthouse Höfn,GH-2210,Breakfast included\n4x4 rental · Dacia Duster,ICE-77015,Gravel cover added",
                    true,
                    1,
                ),
            ),
        ),
        section(
            "packing",
            group(
                t("THE LIST", "label"),
                t("Pack layers, not bulk.", "h3"),
                bullets(
                    "Wool base, fleece, shell; nothing cotton",
                    "Swimsuit and a quick-dry towel, always in the day bag",
                    "Microspikes for the waterfall paths",
                    "Sunglasses for the low sun, headlamp for the early starts",
                    "The card that waives gravel damage, in the glovebox",
                ),
            ),
        ),
        section(
            "close",
            group(
                t("Drive slow. Stop often.", "h2"),
                t(
                    "Roads and weather: road.is and vedur.is · 112 works everywhere in the country",
                    "caption",
                ),
            ),
            { background: bgImage(pic(276, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(277, 1700, 1100), 0.3),
);

export const realEstateListing: ArtifactContent = doc(
    "couture",
    [
        section(
            "cover",
            group(
                t("PRIVATE LISTING · MENDOCINO COAST", "label"),
                t("The Headland House", "h1"),
                t(
                    "A 1962 stone and cedar house on two acres of bluff, every principal room facing open water, offered for the first time in thirty years.",
                    "subtitle",
                ),
                t("Shown by appointment", "caption"),
                pin(badge("Open house · Sat 2 to 4"), "end", "start", {
                    dx: -24,
                    dy: 24,
                    rotate: -5,
                    z: 2,
                }),
            ),
            { background: bgImage(pic(278, 1700, 1100), 0.45) },
        ),
        section(
            "facts",
            group(
                row(
                    { align: "baseline", gap: 10 },
                    fitW(t("$4.85M", "h1")),
                    t("for the house and both acres of bluff.", "h2"),
                ),
                row(
                    stat("4", "bedrooms · 3 baths"),
                    stat("2.1", "acres of bluff"),
                    stat("3,240", "square feet"),
                ),
            ),
        ),
        section(
            "house",
            split(
                60,
                group(
                    t("THE HOUSE", "label"),
                    t("Built to hold the weather off, and the view in.", "h2"),
                    t(
                        "The great room runs the full width of the house under a beamed ceiling, the original basalt fireplace at one end and a wall of glass at the other. Floors are old-growth fir, refinished. The kitchen was rebuilt in 2019 around a soapstone island, and the morning side of the house takes its coffee on a sheltered terracotta terrace.",
                        "body",
                    ),
                ),
                img(pic(279), 0.82),
            ),
        ),
        section(
            "rooms",
            row(
                group(img(pic(280), 0.8), t("The primary bedroom, first light.", "caption")),
                group(img(pic(281), 0.8), t("The den, west light all afternoon.", "caption")),
                group(img(pic(282), 0.8), t("The stair landing on the garden side.", "caption")),
            ),
        ),
        section(
            "specs",
            group(
                t("PARTICULARS", "label"),
                table(
                    "Item,Detail\nBuilt,1962 · Hargrove & Sons\nRenovated,2019 · kitchen and systems\nHeat,Radiant floors + heat pump\nWater,Private well · new 2021\nSeptic,Inspected March 2026\nParcel,APN 118-220-014 · 2.1 acres",
                ),
            ),
        ),
        section(
            "setting",
            group(
                t("Two miles of coast trail out the back gate.", "h2"),
                t(
                    "The bluff path runs from the cove stairs to the point, and the gray whales pass close in March.",
                    "caption",
                ),
            ),
            { background: bgImage(pic(283, 1700, 1100), 0.5) },
        ),
        section(
            "land",
            split(
                40,
                img(pic(284), 1.05),
                group(
                    t("THE LAND", "label"),
                    t("Bluff, meadow, and a stair to the cove.", "h2"),
                    t(
                        "An acre of wildflower meadow buffers the house from the road, and a private stair drops to a sand cove that belongs, at low tide, to whoever walked down. The vegetable beds and the greenhouse sit in the lee of the house, out of the wind.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "area",
            group(
                t("THE AREA", "label"),
                t("Ten minutes to the village.", "h3"),
                t(
                    "Two restaurants, a good bakery, a harbor that still fishes. Three hours ten from the Golden Gate, and the last forty minutes are the reason you come.",
                    "body",
                ),
            ),
        ),
        section(
            "agent",
            split(
                60,
                group(
                    t("SHOWN BY", "label"),
                    t("Rowan Ellery · Coastal Properties", "h3"),
                    t(
                        "Twenty-two years on this coast, and eleven sales on this road. Private showings daily; please allow an hour, because the house insists on it.",
                        "body",
                    ),
                    linked(
                        "caption",
                        ["rowan@coastalprops.com", "mailto:rowan@coastalprops.com"],
                        " · ",
                        ["(707) 555-0134", "tel:+17075550134"],
                        " · Brokers welcome at 2.5%",
                    ),
                ),
                img(pic(285), 0.82),
            ),
        ),
        section(
            "close",
            group(
                t("Thirty years with one family. Ready for the next.", "h2"),
                t(
                    "Offers reviewed as received · Seller reserves the right to set a date",
                    "caption",
                ),
            ),
            { background: bgImage(pic(286, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(287, 1700, 1100), 0.3),
);

export const guestGuide: ArtifactContent = doc(
    "loft",
    [
        section(
            "cover",
            group(
                t("GUEST GUIDE", "label"),
                t("The Canal Flat", "h1"),
                t(
                    "Welcome to Prinsengracht 214B. This little book answers the questions guests actually ask, and a few you have not thought of yet.",
                    "subtitle",
                ),
                t("Iris & Daan · +31 6 21 44 90 82, day or night", "caption"),
            ),
            { background: bgImage(pic(288, 1700, 1100), 0.5) },
        ),
        section(
            "arrival",
            split(
                40,
                group(
                    img(pic(289), 1.05),
                    pin(
                        w(
                            60,
                            card(
                                t("DOOR CODE 4471", "label"),
                                t("The keypad sticks, push twice.", "body"),
                            ),
                        ),
                        "end",
                        "start",
                        { dx: 24, dy: 18, rotate: 3, z: 2 },
                    ),
                ),
                group(
                    t("GETTING IN", "label"),
                    t("The green door by the bikes.", "h2"),
                    t(
                        "Door code 4471, then two flights up, the steepest stairs in the city if we are being honest. Your key is in lockbox B, code 0214. The staircase predates the suitcase, so leave anything heavy at the bottom and buzz; Daan carries, and claims to enjoy it.",
                        "body",
                    ),
                    t("Check-in from 3 PM · Checkout by 11", "caption"),
                ),
            ),
        ),
        section(
            "flat",
            group(
                t("THE FLAT", "label"),
                table(
                    "Wifi,CanalFlat-5G · password tulip-tulip-214\nHeat,Dial in the hall · 20 is cozy\nHot water,Endless · within reason\nCoffee,Grinder and moka pot by the stove · beans in the freezer\nQuiet hours,10 PM to 8 AM · the neighbors are lovely",
                    false,
                    1,
                ),
            ),
        ),
        section(
            "notes",
            group(
                t("HOUSE NOTES", "label"),
                bullets(
                    "The windows open wide and the canal is closer than it looks; mind laptops on the sill",
                    "The left burner runs hot, the right one sulks",
                    "Water the basil if it droops; it repays you at dinner",
                    "Glass recycling goes to the bin on the bridge corner, everything else under the sink",
                ),
            ),
        ),
        section(
            "picks",
            group(
                t("AROUND THE CORNER", "label"),
                t("Five places we love.", "h2"),
                row(
                    group(
                        img(pic(290), 0.8),
                        t(
                            "Café Zog, three doors down. Sit outside, order the apple cake.",
                            "caption",
                        ),
                    ),
                    group(
                        img(pic(291), 0.8),
                        t(
                            "The floating market on Saturday mornings. Arrive before ten.",
                            "caption",
                        ),
                    ),
                    group(
                        img(pic(292), 0.8),
                        t("De Rode Hoek, for dinner when you don't want to decide.", "caption"),
                    ),
                ),
                bullets(
                    "Bar Lucas for a late drink; ask for the bitterballen",
                    "The bakery on the bridge sells out of croissants by nine, and this is a warning",
                ),
            ),
        ),
        section(
            "bridges",
            group(
                t("You are four bridges from everything.", "h2"),
                t(
                    "The Nine Streets, ten minutes on foot · The museums, fifteen by tram",
                    "caption",
                ),
            ),
            { background: bgImage(pic(293, 1700, 1100), 0.5) },
        ),
        section(
            "around",
            split(
                60,
                group(
                    t("GETTING AROUND", "label"),
                    t("Do it the Dutch way.", "h2"),
                    t(
                        "The two bikes chained by the door are yours; helmets hang on the hook and the lock code is the door code backwards. Rain is not a reason here, but if it becomes one, tram 13 and 17 stop at the end of the street and a GVB day pass covers everything.",
                        "body",
                    ),
                    t("Airport: direct train from Centraal, 17 minutes", "caption"),
                ),
                img(pic(294), 0.82),
            ),
        ),
        section(
            "leaving",
            group(
                t("LEAVING", "label"),
                t("Checkout by 11, like you were never here.", "h2"),
                bullets(
                    "Keys back in lockbox B, scramble the dials",
                    "Strip the beds and leave towels in the tub",
                    "Run the dishwasher with whatever is in it",
                    "Crack one window for the plants; we close it after",
                ),
                t("Leave the rest to us. Safe travels home, and thank you for staying.", "caption"),
            ),
        ),
        section(
            "daytrips",
            group(
                t("IF YOU HAVE A SPARE DAY", "label"),
                dish("Bruges", "1 hr by train", "Go midweek · the canals without the crowds"),
                dish("Zaanse Schans", "20 min", "Windmills before ten, back by lunch"),
                dish("The dunes", "40 min by bike", "Flat all the way · pack the towel"),
            ),
        ),
        section(
            "seasons",
            group(
                t("The flat keeps its own calendar.", "h2"),
                t(
                    "Tulips in April, canal swims in July, candles by November. Come back for a different city.",
                    "caption",
                ),
            ),
            { background: bgImage(pic(295, 1700, 1100), 0.5) },
        ),
        section(
            "return",
            group(
                t("Come back in tulip season.", "h2"),
                linked("caption", "Iris & Daan · ", ["thecanalflat.nl", "https://thecanalflat.nl"]),
            ),
            { background: bgImage(pic(296, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(297, 1700, 1100), 0.3),
);

export const recipeCollection: ArtifactContent = doc(
    "loft",
    [
        section(
            "cover",
            group(
                t("A FAMILY COOKBOOK · SECOND PRINTING", "label"),
                t("Kept Recipes", "h1"),
                t(
                    "Four dishes our family makes so often the cards wore out. Written down properly at last, with the shortcuts and the warnings.",
                    "subtitle",
                ),
                t("Collected by Ada Okafor · Winter 2026", "caption"),
            ),
            { background: bgImage(pic(298, 1700, 1100), 0.6) },
        ),
        section(
            "before",
            split(
                60,
                group(
                    t("BEFORE YOU START", "label"),
                    t(
                        "These are home recipes, not restaurant ones. The measurements are honest but the vegetables are not, so taste as you go and trust your own salt. Where a step can be done a day ahead, it says so; where it says do not walk away, someone once walked away.",
                        "body",
                    ),
                    t("Ada, for everyone who asked", "caption"),
                ),
                img(pic(299), 0.82),
            ),
        ),
        section(
            "r1",
            group(
                t("NO 1 · BREAKFAST", "label"),
                t("Roasted strawberries on yogurt", "h2"),
                t("Serves 2 · 25 minutes, mostly oven", "caption"),
                split(
                    40,
                    img(pic(300), 1.05),
                    group(
                        t("INGREDIENTS", "label"),
                        bullets(
                            "A pound of strawberries, hulled and halved",
                            "A spoonful of honey, plus more at the table",
                            "A squeeze of lemon and a pinch of salt",
                            "Thick yogurt, the kind a spoon stands up in",
                            "Toasted almonds or granola, for the top",
                        ),
                    ),
                ),
                t("METHOD", "label"),
                t(
                    "1. Heat the oven to 375. Toss the berries with honey, lemon, and salt on a lined tray.",
                    "body",
                ),
                t(
                    "2. Roast 18 to 20 minutes until slumped and jammy at the edges. Cool five minutes; the juice thickens as it sits.",
                    "body",
                ),
                t(
                    "3. Spoon over cold yogurt, scrape every bit of the pan syrup on top, and finish with the crunch.",
                    "body",
                ),
            ),
        ),
        section(
            "r2",
            group(
                t("NO 2 · LUNCH", "label"),
                t("The Tuesday salad", "h2"),
                t("Serves 4 · 20 minutes", "caption"),
                split(
                    40,
                    img(pic(301), 1.05),
                    group(
                        t("INGREDIENTS", "label"),
                        bullets(
                            "Two heads of the crunchiest lettuce around",
                            "A cucumber, a handful of radishes, and whatever the fridge offers",
                            "Chickpeas, rinsed, or yesterday's chicken",
                            "Feta, crumbled rudely",
                            "Dressing: olive oil, lemon, a small spoon of mustard, garlic",
                        ),
                    ),
                ),
                t("METHOD", "label"),
                t(
                    "1. Chop everything the same size, smaller than you think. This is the whole secret.",
                    "body",
                ),
                t("2. Shake the dressing in a jar until it turns cloudy and thick.", "body"),
                t(
                    "3. Dress just before eating, season loudly, and serve with bread you toasted in the same bowl's spirit.",
                    "body",
                ),
            ),
        ),
        section(
            "pantry",
            group(
                t("THE PANTRY RULES", "label"),
                t("Buy less, but buy the good one.", "h2"),
                t(
                    "One good olive oil for finishing and a cheap one for the pan. Salt is flaky unless the recipe says otherwise. Lemons are not optional. Spices older than a year are potpourri and should be treated as such.",
                    "body",
                ),
            ),
            { background: bgImage(pic(302, 1700, 1100), 0.55) },
        ),
        section(
            "r3",
            group(
                t("NO 3 · DINNER", "label"),
                t("Red lentil dal, the quiet version", "h2"),
                t("Serves 4, or 2 with the right leftovers · 45 minutes", "caption"),
                split(
                    40,
                    img(pic(303), 1.05),
                    group(
                        t("INGREDIENTS", "label"),
                        bullets(
                            "A cup and a half of red lentils, rinsed until the water runs clear",
                            "An onion, softened slowly, and four cloves of garlic",
                            "Ginger, cumin, turmeric, and one whole dried chili",
                            "A tin of tomatoes and a tin of coconut milk",
                            "Butter and lime at the end; do not skip the lime",
                        ),
                    ),
                ),
                t("METHOD", "label"),
                t(
                    "1. Soften the onion in butter longer than feels reasonable, then wake the garlic, ginger, and spices in it for one fragrant minute.",
                    "body",
                ),
                t(
                    "2. Add lentils, tomatoes, coconut milk, and two cups of water. Simmer low, lid ajar, 25 minutes, stirring when you pass by.",
                    "body",
                ),
                t(
                    "3. Season, then finish with the last of the butter and the lime. Rice or flatbread, and the chili on the side for the brave.",
                    "body",
                ),
            ),
        ),
        section(
            "r4",
            group(
                t("NO 4 · THE TIN", "label"),
                t("Olive oil shortbread with lime", "h2"),
                t("Makes 24 · An hour, half of it waiting", "caption"),
                split(
                    40,
                    img(pic(304), 1.05),
                    group(
                        t("INGREDIENTS", "label"),
                        bullets(
                            "Two cups of flour and half a cup of sugar",
                            "Three quarters of a cup of good olive oil",
                            "Zest of two limes, juice of one",
                            "A firm pinch of salt, and sugar for rolling",
                        ),
                    ),
                ),
                t("METHOD", "label"),
                t(
                    "1. Stir dry, add oil and zest, and press into a shaggy dough. Chill 30 minutes; it firms as the flour drinks.",
                    "body",
                ),
                t(
                    "2. Roll into a log, slice thick coins, roll the edges in sugar, and bake at 350 for 14 minutes until barely gold.",
                    "body",
                ),
                t(
                    "3. Brush the tops with lime juice while warm. They keep a week in the tin, in theory.",
                    "body",
                ),
            ),
        ),
        section(
            "swaps",
            group(
                t("SWAPS THAT WORK", "label"),
                bullets(
                    "Any berry roasts like the strawberries; rhubarb wants an extra spoon of honey",
                    "The dal takes spinach in the last five minutes without complaint",
                    "Lemon stands in for lime in the shortbread, and no one has ever noticed",
                    "The salad dressing is also a marinade; this is the family's oldest secret",
                ),
            ),
        ),
        section(
            "r5",
            group(
                t("NO 5 · THE CONVERT", "label"),
                t("Braised red cabbage, the peacemaker", "h2"),
                t("Serves 6 as a side · 90 minutes, mostly unattended", "caption"),
                split(
                    40,
                    img(pic(305), 1.05),
                    group(
                        t("INGREDIENTS", "label"),
                        bullets(
                            "One red cabbage, shredded finer than feels necessary",
                            "Two apples, an onion, and a knob of butter",
                            "A glug of vinegar, a spoon of brown sugar, cloves",
                        ),
                    ),
                ),
                t("METHOD", "label"),
                t(
                    "1. Soften the onion, then everything else into the pot with a splash of water.",
                    "body",
                ),
                t(
                    "2. Lid on, lowest heat, 90 minutes; stir when you think of it. It should collapse and gleam.",
                    "body",
                ),
                t(
                    "3. Season loudly. Serve to the relative who claims to hate cabbage; apologize to no one.",
                    "body",
                ),
            ),
        ),
        section(
            "keeping",
            group(
                t("ON KEEPING RECIPES", "label"),
                quote(
                    "A recipe card outlives the hand that wrote it. That's the whole reason to write things down.",
                    "Ada · from the first printing's foreword",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "close",
            group(
                t("Add your own on the blank pages.", "h2"),
                t("For the grandchildren, who should double the garlic.", "caption"),
            ),
            { background: bgImage(pic(306, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(307, 1700, 1100), 0.3),
);

export const eventProgram: ArtifactContent = doc(
    "royal",
    [
        section(
            "cover",
            group(
                t("THE ORPHEUM HALL · BENEFIT CONCERT", "label"),
                t("Winter Songbook", "h1"),
                t(
                    "An evening of songs for the hall that keeps them. Every seat tonight goes toward the roof restoration.",
                    "subtitle",
                ),
                t("Saturday, 6 December · Doors at 7, music at 7:30", "caption"),
            ),
            { background: bgImage(pic(308, 1700, 1100), 0.5) },
        ),
        section(
            "welcome",
            group(
                t("WELCOME", "label"),
                t(
                    "Thank you for climbing our stairs on a cold night. You are sitting in an eighty-nine-year-old room that has held big bands, poets, union meetings, and four thousand weddings' worth of first dances. It has also, lately, held rain. Tonight is for the roof: three sets, one interval, and songs you are welcome to take home with you.",
                    "body",
                ),
                t("Petra Lindqvist, director", "caption"),
            ),
        ),
        section(
            "program",
            group(
                t("THE PROGRAM", "label"),
                dish("River Songs", "15 min", "Etta Vaughn · guitar and voice"),
                dish("Three Nocturnes", "12 min", "Jonas Mehl · piano"),
                dish("The Weather Rounds", "10 min", "The house band, all hands"),
                t(
                    "A twenty-minute interval. The bar is in the cloakroom, honor system, proceeds to the roof.",
                    "caption",
                ),
                dish("Hollow Moon", "14 min", "Vaughn & Mehl, duo"),
                dish("Last Boat Home", "8 min", "Everyone on stage, and you, if you know it"),
            ),
        ),
        section(
            "performers",
            row(
                group(
                    img(pic(309), 0.8),
                    t("Etta Vaughn", "h3"),
                    t(
                        "Songwriter and collector of other people's choruses. Three records, one van.",
                        "caption",
                    ),
                ),
                group(
                    img(pic(310), 0.8),
                    t("Jonas Mehl", "h3"),
                    t(
                        "Pianist. Plays the nocturnes on the hall's own 1931 grand, freshly tuned for tonight.",
                        "caption",
                    ),
                ),
                group(
                    img(pic(311), 0.8),
                    t("The house band", "h3"),
                    t(
                        "Seven regulars who have closed this room a hundred times and never twice the same way.",
                        "caption",
                    ),
                ),
            ),
        ),
        section(
            "hall",
            group(
                t("Eighty-nine years of this room.", "h2"),
                t(
                    "The ceiling you hear tonight is the original fir, which is the whole problem and the whole point.",
                    "caption",
                ),
            ),
            { background: bgImage(pic(312, 1700, 1100), 0.5) },
        ),
        section(
            "appeal",
            split(
                60,
                group(
                    t("THE ROOF FUND", "label"),
                    t("Where tonight's money goes.", "h2"),
                    t(
                        "New slates over the stage house, flashing on the north gable, and repairs to the organ loft where the water got in. We are $61,000 from watertight, and the winter is not waiting. Every ticket, every honor-system pour, and every donation goes to the same ledger, which hangs in the lobby for anyone to read.",
                        "body",
                    ),
                    button("Give to the roof fund", "https://orpheumhall.org/roof"),
                ),
                img(pic(313), 0.82),
            ),
        ),
        section(
            "thanks",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("WITH THANKS", "label")),
                        fitW(t("The Calloway family · Anonymous, twice", "caption")),
                        fitW(t("Hartwell Plumbing, who fixed what the rain broke", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("AND TO", "label")),
                        fitW(t("The volunteer ushers, twenty strong", "caption")),
                        fitW(t("Rosa's Bakery, for the interval shortbread", "caption")),
                    ),
                ),
            ),
        ),
        section(
            "history",
            split(
                40,
                img(pic(314), 1.05),
                group(
                    t("THE ROOM YOU'RE IN", "label"),
                    t("Eighty-nine years, briefly.", "h2"),
                    t(
                        "Built 1937 as a union hall, jazz room by the fifties, nearly a parking garage in 1981 until four hundred neighbors said otherwise. The fir ceiling you hear tonight is original, which is the whole problem and the whole point.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "next",
            group(
                t("NEXT AT THE ORPHEUM", "label"),
                dish(
                    "January 17",
                    "The Winter Reels",
                    "Local footage night · the harbor films, restored",
                ),
                dish("February 8", "Songbook II", "If the roof fund clears · same hall, drier"),
                dish("Monthly", "Open floor", "First Mondays · anyone, one song, kind room"),
            ),
        ),
        section(
            "close",
            group(
                t("Sing the last one with us.", "h2"),
                t(
                    "Photos are welcome; flash is not. Share the night with #wintersongbook",
                    "caption",
                ),
            ),
            { background: bgImage(pic(315, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(316, 1700, 1100), 0.35),
);

// pitch & sell: the paper and pages around the decks

export const execSummary: ArtifactContent = doc(
    "noir",
    [
        section(
            "head",
            group(
                t("EXECUTIVE SUMMARY · CONFIDENTIAL", "label"),
                t("Mise, in two pages", "h1"),
                t(
                    "The operating system for independent restaurant kitchens: forecasting prep, automating orders, and clawing back the margin that waste quietly eats.",
                    "subtitle",
                ),
                t("Seed round · $4M · Dana Reyes, dana@mise.kitchen", "caption"),
            ),
            { background: bgImage(pic(317, 1700, 1100), 0.62) },
        ),
        section(
            "problem",
            group(
                t("THE PROBLEM", "label"),
                t("Restaurants run on 4% margins and 1990s tooling.", "h2"),
                t(
                    "The average independent restaurant throws away 8% of everything it buys, orders by gut feel at 11pm, and learns it lost money a month too late. Front of house got Toast, Square, and Resy over the last decade. The back of house, where the money is actually made or lost, still runs on clipboards and group texts.",
                    "body",
                ),
            ),
        ),
        section(
            "solution",
            split(
                60,
                group(
                    t("THE PRODUCT", "label"),
                    t("One screen the whole line actually opens.", "h2"),
                    bullets(
                        "Prep lists that predict tomorrow from last year, the weather, and tonight's reservations",
                        "Orders that draft themselves to par and send with one tap",
                        "Live food cost by dish, by station, by shift",
                    ),
                ),
                img(pic(318), 0.82),
            ),
        ),
        section(
            "traction",
            row(
                stat("38", "kitchens live"),
                stat("310bps", "avg food-cost reduction"),
                stat("112%", "net revenue retention"),
            ),
        ),
        section(
            "market",
            group(
                t("THE MARKET", "label"),
                t(
                    "749K U.S. restaurant locations spend $1.1T a year and waste $162B of it. The wedge is the 180K independents with two to twenty locations: big enough to feel the waste, small enough to have no analyst to fight it.",
                    "body",
                ),
            ),
        ),
        section(
            "whynow",
            split(
                60,
                group(
                    t("WHY NOW", "label"),
                    t("The stack finally reaches the kitchen.", "h2"),
                    t(
                        "Supplier APIs, cheap tablets on every pass, and POS data that finally leaves the terminal: the pieces Mise assembles did not exist together three years ago. The first mover gets the supplier network, and the supplier network is the moat.",
                        "body",
                    ),
                ),
                img(pic(319), 0.82),
            ),
        ),
        section(
            "model",
            group(
                t("BUSINESS MODEL", "label"),
                dish(
                    "SaaS, per kitchen",
                    "$349/mo",
                    "Flat, not per seat; a kitchen is a team by definition",
                ),
                dish(
                    "Supplier network fee",
                    "1.2%",
                    "Paid by suppliers on orders routed through Mise, not by kitchens",
                ),
                dish("Gross margin", "81%", "Blended, at current scale"),
            ),
        ),
        section(
            "competition",
            group(
                t("THE FIELD", "label"),
                table(
                    "Player,What they do,What they miss\nMarketMan · BlueCart,Ordering,No forecasting · no line view\nToast · Square,Front of house,The kitchen is a settings page\nSpreadsheets,Everything,Sunday nights · silent errors",
                ),
                t("Nobody owns the pass. That gap is the company.", "caption"),
            ),
        ),
        section(
            "team",
            group(
                t("THE TEAM", "label"),
                row(
                    group(
                        img(pic(320), 1),
                        t("Dana Reyes", "h3"),
                        t("CEO · ex-Toast, ran ops for 40 kitchens", "caption"),
                    ),
                    group(
                        img(pic(321), 1),
                        t("Marcus Vallée", "h3"),
                        t("CTO · ex-Flexport forecasting", "caption"),
                    ),
                    group(
                        img(pic(322), 1),
                        t("Priya Anand", "h3"),
                        t("Head of Culinary · 12 years on the line", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "ask",
            group(
                t("THE ASK", "label"),
                t("Raising $4M to put Mise in 1,000 kitchens.", "h2"),
                t(
                    "Supplier API coverage (40%), the forecasting and food-cost engine (35%), and a culinary-led go-to-market across the top 20 U.S. metros (25%). 24 months of runway to $4M ARR.",
                    "body",
                ),
                linked("caption", "Full deck and data room on request · ", [
                    "dana@mise.kitchen",
                    "mailto:dana@mise.kitchen",
                ]),
            ),
            { background: bgImage(pic(323, 1700, 1100), 0.6) },
        ),
    ],
    bgImage(pic(324, 1700, 1100), 0.3),
);

export const productSheet: ArtifactContent = doc(
    "carbon",
    [
        section(
            "head",
            group(
                t("PRODUCT SHEET", "label"),
                t("Fleetwise", "h1"),
                t(
                    "Predictive maintenance for truck fleets. Reads the telematics you already pay for and turns them into work orders you do before the breakdown.",
                    "subtitle",
                ),
                t("For operations & maintenance leaders · 20 to 2,000 vehicles", "caption"),
            ),
            { background: bgImage(pic(325, 1700, 1100), 0.6) },
        ),
        section(
            "how",
            split(
                60,
                group(
                    t("HOW IT WORKS", "label"),
                    t("Live in two weeks, no new hardware.", "h2"),
                    bullets(
                        "Connect your telematics: read-only, forty minutes, every major provider",
                        "Fleetwise scores every vehicle and flags failures two to six weeks out",
                        "Work orders draft themselves with parts, labor, and the best open bay window",
                    ),
                ),
                img(pic(326), 0.82),
            ),
        ),
        section(
            "numbers",
            row(
                stat("52%", "fewer roadside failures"),
                stat("78%", "of work now planned"),
                stat("11×", "first-year ROI"),
            ),
        ),
        section(
            "specs",
            group(
                t("SPECIFICATIONS", "label"),
                table(
                    "Item,Detail\nTelematics,Samsara · Geotab · Motive · Verizon Connect\nCoverage,Class 3 through Class 8 · EV and diesel\nIntegrations,Fullbay · Fleetio · your parts supplier's catalog\nSecurity,SOC 2 Type II · read-only vehicle access\nDeployment,Cloud · nothing installed in the truck",
                    true,
                    1,
                ),
            ),
        ),
        section(
            "pricing",
            group(
                t("PRICING", "label"),
                t("Per truck, under one day of downtime.", "h3"),
                table(
                    "Plan,Per truck / mo,Includes\nCore,$29,Health scores & failure alerts\nShop,$39,+ Auto work orders & parts\nFleet,$34,Multi-depot · 100+ trucks",
                ),
            ),
        ),
        section(
            "case",
            split(
                40,
                img(pic(327), 1.05),
                group(
                    t("IN THE FIELD", "label"),
                    t("Meridian Freight, 212 trucks.", "h2"),
                    t(
                        "Eleven months on Fleetwise: roadside failures halved, $410K in downtime avoided, and the maintenance chief stopped carrying two phones. Their fleet review is now a fifteen-minute meeting.",
                        "body",
                    ),
                    t("Reference call available on request", "caption"),
                ),
            ),
        ),
        section(
            "quote",
            group(
                quote(
                    "We used to staff for breakdowns. Now we staff for the schedule Fleetwise hands us the night before.",
                    "Carla Mendez · VP Maintenance, Meridian Freight",
                ),
            ),
            { background: bgImage(pic(328, 1700, 1100), 0.62) },
        ),
        section(
            "rollout",
            group(
                t("THE FIRST SIX WEEKS", "label"),
                table(
                    "Week,What happens\n1,Telematics connected · fleet scored\n2,First flagged failures · work orders drafting\n3 to 4,Parts catalog linked · depot routing tuned\n5 to 6,Planned work overtakes reactive · review call",
                ),
            ),
        ),
        section(
            "faq",
            group(
                t("ASKED BY EVERY OPS LEAD", "label"),
                bullets(
                    "No new hardware: we read the telematics you already pay for",
                    "Read-only vehicle access; Fleetwise can never touch a truck's controls",
                    "Month to month after the first year; leaving takes one email and your data with you",
                ),
            ),
        ),
        section(
            "cta",
            group(
                t("See your own fleet's risk in 30 minutes.", "h2"),
                t(
                    "Send read-only telematics access and we bring a free risk assessment of your top 25 vehicles to the next call.",
                    "body",
                ),
                linked(
                    "caption",
                    ["fleetwise.io/assessment", "https://fleetwise.io/assessment"],
                    " · ",
                    ["sales@fleetwise.io", "mailto:sales@fleetwise.io"],
                ),
            ),
            { background: bgImage(pic(329, 1700, 1100), 0.6) },
        ),
    ],
    bgImage(pic(330, 1700, 1100), 0.3),
);

export const factSheet: ArtifactContent = doc(
    "obsidian",
    [
        section(
            "head",
            group(
                t("COMPANY FACT SHEET · 2026", "label"),
                t("Switchboard", "h1"),
                t(
                    "The AI front desk for home-services businesses: answering every call and text in seconds, booking the job, and keeping the schedule full, around the clock.",
                    "subtitle",
                ),
                t("Founded 2024 · Austin, TX · 63 people", "caption"),
            ),
            { background: bgImage(pic(331, 1700, 1100), 0.58) },
        ),
        section(
            "numbers",
            row(
                stat("2,400", "businesses on Switchboard"),
                stat("$6.8M", "ARR, up 3.1× YoY"),
                stat("$140M", "in jobs booked for customers"),
            ),
        ),
        section(
            "what",
            group(
                t("WHAT WE DO", "label"),
                t(
                    "The trades still run on the phone, and a third of calls go to voicemail. Switchboard answers in under two seconds in English or Spanish, books the job straight into the calendar, and hands off to a human the moment it should. Owners see booked work, not missed calls.",
                    "body",
                ),
            ),
        ),
        section(
            "milestones",
            group(
                t("MILESTONES", "label"),
                table(
                    "When,What\n2024,Founded · first 100 contractors in Texas\n2025,Series Seed · texting and scheduling ship\nJan 2026,1000th business · Spanish goes GA\nJune 2026,Series A · $18M led by Meridian Ventures",
                ),
            ),
        ),
        section(
            "leadership",
            row(
                group(
                    img(pic(332), 1),
                    t("Dana Whitfield", "h3"),
                    t("CEO · ex-ServiceTitan, scaled 3,000 contractors", "caption"),
                ),
                group(
                    img(pic(333), 1),
                    t("Amir Hassan", "h3"),
                    t("CTO · ex-Google speech, built real-time voice", "caption"),
                ),
                group(
                    img(pic(334), 1),
                    t("Lena Ortiz", "h3"),
                    t("Head of Revenue · ex-Jobber, 0 to $30M", "caption"),
                ),
            ),
        ),
        section(
            "product",
            split(
                60,
                group(
                    t("THE PRODUCT, BRIEFLY", "label"),
                    t("Answers the phone, books the job, hands off like a pro.", "h2"),
                    bullets(
                        "Voice agents tuned per trade: a roofing call is not a plumbing call",
                        "Books straight into ServiceTitan, Jobber, and Housecall Pro",
                        "Hands to a human mid-sentence the moment it should",
                    ),
                ),
                img(pic(335), 0.82),
            ),
        ),
        section(
            "market",
            row(
                stat("104K", "home-services businesses in North America"),
                stat("31%", "of their calls miss today"),
                stat("$38B", "in jobs lost to voicemail yearly"),
            ),
        ),
        section(
            "moments",
            group(
                t("A YEAR IN THREE MOMENTS", "label"),
                row(
                    group(
                        img(pic(336), 1.4),
                        t("January: Spanish goes GA and Texas triples", "caption"),
                    ),
                    group(
                        img(pic(337), 1.4),
                        t("March: the 1000th business, a roofer in Tulsa", "caption"),
                    ),
                    group(
                        img(pic(338), 1.4),
                        t("June: the Series A, led by Meridian Ventures", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "investors",
            group(
                t("BACKERS", "label"),
                t(
                    "Meridian Ventures · Homestead Capital · the founders of ServiceTitan and Jobber, personally.",
                    "body",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "press",
            group(
                t("PRESS & CONTACT", "label"),
                linked(
                    "body",
                    "Media: ",
                    ["press@switchboard.ai", "mailto:press@switchboard.ai"],
                    " · Partnerships: ",
                    ["partners@switchboard.ai", "mailto:partners@switchboard.ai"],
                ),
                t(
                    "Boilerplate: Switchboard is the AI front desk for the trades. Its voice agents answer, qualify, and book for plumbing, HVAC, electrical, and roofing businesses across North America.",
                    "caption",
                ),
            ),
            { background: bgImage(pic(339, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(340, 1700, 1100), 0.3),
);

export const partnershipPitch: ArtifactContent = doc(
    "royal",
    [
        section(
            "head",
            group(
                t("PARTNERSHIP PROPOSAL", "label"),
                t("Harborlight × Cascadia Coffee", "h1"),
                t(
                    "One festival, 65,000 guests, and a coffee program with your name over the door. A proposal for Cascadia to become Harborlight 2026's official coffee.",
                    "subtitle",
                ),
                t("Prepared for the Cascadia brand team · January 2026", "caption"),
            ),
            { background: bgImage(pic(341, 1700, 1100), 0.6) },
        ),
        section(
            "why",
            group(
                t("WHY THIS FITS", "label"),
                t("Your drinkers are already here.", "h2"),
                t(
                    "Harborlight's crowd is 68% aged 21 to 44, spends $120 a head on site, and starts every festival morning in a coffee line a hundred deep. Last year that line was generic. This year it could be yours: three days of first sips, every cup in a Cascadia sleeve, and the harbor sunrise doing your art direction.",
                    "body",
                ),
            ),
        ),
        section(
            "shape",
            group(
                t("THE SHAPE OF IT", "label"),
                dish(
                    "The Morning Bar",
                    "included",
                    "A flagship stand at the gate, staffed by your baristas, open from doors",
                ),
                dish(
                    "Every backstage rider",
                    "included",
                    "Artists drink Cascadia; artists post about Cascadia",
                ),
                dish(
                    "The Sunrise Set",
                    "co-branded",
                    "Sunday's acoustic set, presented by Cascadia, filmed for both channels",
                ),
            ),
        ),
        section(
            "numbers",
            row(
                stat("65K", "guests across three days"),
                stat("40K+", "cups at last year's festival"),
                stat("4.2M", "social impressions in campaign window"),
            ),
        ),
        section(
            "audience",
            group(
                t("WHO'S IN THE CROWD", "label"),
                table(
                    "Segment,Share,Note\nAges 21 to 34,44%,Your growth demographic\nAges 35 to 44,24%,Your loyalists\nTraveling from out of town,38%,Hotel stays · long weekends\nHousehold income $75K+,61%,They buy the good beans",
                ),
            ),
        ),
        section(
            "handled",
            split(
                40,
                img(pic(342), 1.05),
                group(
                    t("WHAT WE HANDLE", "label"),
                    t("You bring the coffee; we carry everything else.", "h2"),
                    checks(
                        "Permits, power, water, and cold storage at both stands",
                        "Staffing beyond your two lead baristas, trained on your recipes",
                        "All signage production, to your brand guidelines",
                        "A dedicated partner manager on radio all weekend",
                    ),
                ),
            ),
        ),
        section(
            "lastyear",
            group(
                t("PARTNERS SAY", "label"),
                quote(
                    "Cleanest festival activation we've done. The crowd came to us, the ops ran themselves, and we sold eleven weeks of product in three days.",
                    "Brand lead · Halcyon Brewing · 2025 partner",
                ),
            ),
            { background: bgImage(pic(343, 1700, 1100), 0.6) },
        ),
        section(
            "timeline",
            group(
                t("THE RUNWAY", "label"),
                table(
                    "When,What\nMarch,Walk-through together · handshake\nApril,Contract signed · creative starts\nJune,Assets locked · staff training at your roastery\nAugust 14 to 16,The festival · 65K first sips",
                ),
            ),
        ),
        section(
            "terms",
            group(
                t("INVESTMENT & TERMS", "label"),
                t(
                    "$45K partner fee plus product at cost. Cascadia keeps bar revenue; Harborlight keeps naming approval. One-year term with first right of renewal for 2027, and a walk-through together in March before either of us signs anything.",
                    "body",
                ),
                linked("caption", "Talk to us: ", [
                    "partners@harborlightfest.org",
                    "mailto:partners@harborlightfest.org",
                ]),
            ),
            { background: bgImage(pic(344, 1700, 1100), 0.58) },
        ),
    ],
    bgImage(pic(345, 1700, 1100), 0.32),
);
export const aboutPage: ArtifactContent = web(
    "noir",
    [
        section(
            "hero",
            group(
                siteNav(
                    "MISE",
                    navLink("Story", "#story"),
                    navLink("Team", "#team"),
                    navLink("Press", "#press"),
                    navCta("Open Mise", "https://app.mise.kitchen"),
                ),
                t("ABOUT US", "label"),
                t("Built by people who closed the kitchen.", "h1"),
                t(
                    "Mise exists because three of us spent years running restaurants and could not believe the best tool for the job was a clipboard. This is the story, the people, and the point.",
                    "subtitle",
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(346, 1700, 1100), 0.6),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "story",
            split(
                60,
                group(
                    t("THE STORY", "label"),
                    t("It started with a walk-in full of waste.", "h2"),
                    t(
                        "In 2023 Dana ran ops for forty kitchens and watched the same scene forty times: great cooks, thin margins, and a Sunday order built from memory. The first version of Mise was a spreadsheet she emailed to six chefs. Four of them still run it, inside the product it became.",
                        "body",
                    ),
                    t(
                        "We are cooks first and software people second, which is why the product opens to a prep list and not a dashboard.",
                        "body",
                    ),
                ),
                img(pic(347), 0.82),
            ),
        ),
        section(
            "numbers",
            row(
                stat("38", "kitchens live"),
                stat("2023", "founded in Portland"),
                stat("14", "of us, half from kitchens"),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "values",
            group(
                t("WHAT WE BELIEVE", "label"),
                t("The line cook is the user.", "h2"),
                bullets(
                    "If it takes two hands, it ships when it takes one",
                    "Numbers belong on the pass, not in the office",
                    "A feature that saves food beats a feature that makes charts",
                ),
            ),
        ),
        section(
            "team",
            group(
                t("THE TEAM", "label"),
                t("Three founders, one kitchen between them.", "h2"),
                row(
                    group(
                        img(pic(348), 1),
                        t("Dana Reyes", "h3"),
                        t("CEO · ex-Toast, ran ops for 40 kitchens", "caption"),
                    ),
                    group(
                        img(pic(349), 1),
                        t("Marcus Vallée", "h3"),
                        t("CTO · ex-Flexport forecasting", "caption"),
                    ),
                    group(
                        img(pic(350), 1),
                        t("Priya Anand", "h3"),
                        t("Head of Culinary · 12 years on the line", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "press",
            group(
                t("PRESS", "label"),
                t("Covered by people who eat.", "h3"),
                linked(
                    "body",
                    ["Eater: The software finally coming for food waste", "https://eater.com"],
                    " · ",
                    ["TechCrunch: Mise raises $4M", "https://techcrunch.com"],
                ),
                linked("caption", "Media kit & inquiries: ", [
                    "press@mise.kitchen",
                    "mailto:press@mise.kitchen",
                ]),
            ),
        ),
        section(
            "kitchens",
            group(
                t("THE KITCHENS", "label"),
                t("Thirty-eight rooms that trust us at 6am.", "h2"),
                row(
                    group(
                        img(pic(351), 1.4),
                        t(
                            "Bar Ostra, Portland · first customer, still calls with ideas",
                            "caption",
                        ),
                    ),
                    group(
                        img(pic(352), 1.4),
                        t("The Dorset Group · six rooms, one prep sheet", "caption"),
                    ),
                    group(
                        img(pic(353), 1.4),
                        t("Cafe Zola · where the order tap got its sound", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "voice",
            group(
                testimonial(
                    "They speak kitchen. Every release reads like it was written by someone who has scrubbed a walk-in at midnight, because it was.",
                    "Tomas Ibarra",
                    "Chef-owner, Bar Ostra",
                    "https://i.pravatar.cc/240?img=59",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "press2",
            group(
                t("IN THE INDUSTRY'S WORDS", "label"),
                t(
                    "Named to the Restaurant Tech 25 two years running, and the only back-of-house company on the list built by people who cooked for a living.",
                    "body",
                ),
            ),
        ),
        section(
            "join",
            group(
                t("Work the line with us.", "h2"),
                t("We hire cooks who learned to code and coders who can hold a knife.", "subtitle"),
                button("See open roles", "https://mise.kitchen/careers", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(354, 1700, 1100), 0.6) },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(fitW(t("Mise", "h3")), fitW(t("The kitchen operating system.", "caption"))),
                ),
                fitW(
                    col(
                        fitW(t("COMPANY", "label")),
                        fitW(
                            linked("caption", ["Careers", "https://mise.kitchen/careers"], " · ", [
                                "Press",
                                "mailto:press@mise.kitchen",
                            ]),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("SAY HELLO", "label")),
                        fitW(
                            linked("caption", ["hello@mise.kitchen", "mailto:hello@mise.kitchen"]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(355, 1700, 1100), 0.35),
);

export const demoPage: ArtifactContent = web(
    "telegraph",
    [
        section(
            "hero",
            group(
                siteNav(
                    "SIFT",
                    navLink("What you'll see", "#see"),
                    navLink("FAQ", "#faq"),
                    navCta("Book a demo", "#book"),
                ),
                t("SEE IT ON YOUR OWN FEEDBACK", "label"),
                t("Thirty minutes. Your tickets, not our slides.", "h1"),
                t(
                    "Connect a source live on the call and watch Sift sort a week of your customer feedback into themes before the meeting ends.",
                    "subtitle",
                ),
                button("Pick a time", "#book", { size: "lg" }),
                pin(
                    w(
                        24,
                        card(
                            t("TODAY", "label"),
                            t("Four slots left. They go by lunchtime most days.", "body"),
                        ),
                    ),
                    "end",
                    "end",
                    { dx: -24, dy: 110, z: 2 },
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(356, 1700, 1100), 0.6),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "see",
            split(
                60,
                group(
                    t("WHAT YOU'LL SEE", "label"),
                    t("The demo is the setup.", "h2"),
                    bullets(
                        "Your Zendesk or Intercom connected live, read-only, in front of you",
                        "A week of real requests merged into ranked themes with revenue attached",
                        "One theme pushed to Jira, and the customer-notify loop that follows it",
                    ),
                ),
                img(pic(357), 0.82),
            ),
        ),
        section(
            "agenda",
            group(
                t("THE HALF HOUR", "label"),
                table(
                    "Minutes,What happens\n0 to 5,Your stack · where feedback lives today\n5 to 20,Live connect and the first themes\n20 to 25,Pricing · honestly and briefly\n25 to 30,Your questions · hard ones welcome",
                ),
            ),
        ),
        section(
            "proof",
            group(
                testimonial(
                    "We stopped arguing about the roadmap in meetings. Now we just open Sift and the answer's already there.",
                    "Priya Nair",
                    "VP Product, Northwind Software",
                    "https://i.pravatar.cc/240?img=32",
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
        section(
            "faq",
            group(
                t("BEFORE YOU ASK", "label"),
                t("The questions every demo starts with.", "h2"),
                faq(
                    "collapsible",
                    [
                        [
                            "Do I need to prepare anything?",
                            "An admin login for one feedback source. That's it; we do the rest live.",
                        ],
                        [
                            "Is the connection safe?",
                            "Read-only OAuth, revocable in one click, SOC 2 Type II. Nothing is stored after the call unless you keep the workspace.",
                        ],
                        [
                            "Who should join?",
                            "Whoever owns the roadmap and whoever answers the tickets. The demo lands hardest with both in the room.",
                        ],
                    ],
                    true,
                ),
            ),
        ),
        section(
            "logos",
            group(
                t("TEAMS THAT TOOK THE DEMO", "label"),
                row(
                    fitW(t("NORTHWIND", "h3")),
                    fitW(t("CEDARWORKS", "h3")),
                    fitW(t("HALOWAY", "h3")),
                    fitW(t("FIELD DAY", "h3")),
                    fitW(t("MARA HEALTH", "h3")),
                ),
                t("Average time from demo to first insight shipped: nine days.", "caption"),
            ),
        ),
        section(
            "leave",
            split(
                40,
                img(pic(358), 1.05),
                group(
                    t("WHAT YOU LEAVE WITH", "label"),
                    t("The demo workspace is yours to keep.", "h2"),
                    checks(
                        "Your real themes, ranked, exportable that afternoon",
                        "A revenue-weighted top ten to argue about in your next planning",
                        "Honest pricing on one slide, including the plan we'd pick for you",
                    ),
                ),
            ),
        ),
        section(
            "numbers",
            row(
                stat("30 min", "no follow-up required"),
                stat("0", "slides about our founding story"),
                stat("87%", "of demos end with a connected source"),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "proof2",
            group(
                testimonial(
                    "I booked the demo to shut up a colleague. We were paying customers by Friday and the colleague got a raise.",
                    "Dana Okoro",
                    "Head of Product, Field Day",
                    "https://i.pravatar.cc/240?img=68",
                ),
            ),
        ),
        section(
            "book",
            group(
                t("Bring a messy inbox.", "h2"),
                t("The worse your backlog, the better the demo.", "subtitle"),
                button("Book the 30 minutes", "https://sift.app/demo", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(359, 1700, 1100), 0.55) },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(col(fitW(t("Sift", "h3")), fitW(t("Feedback, sorted.", "caption")))),
                fitW(
                    col(
                        fitW(t("PRODUCT", "label")),
                        fitW(
                            linked("caption", ["sift.app", "https://sift.app"], " · ", [
                                "Pricing",
                                "https://sift.app/pricing",
                            ]),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("QUESTIONS", "label")),
                        fitW(linked("caption", ["demos@sift.app", "mailto:demos@sift.app"])),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(360, 1700, 1100), 0.35),
);

export const wallOfLove: ArtifactContent = web(
    "obsidian",
    [
        section(
            "hero",
            group(
                siteNav(
                    "SWITCHBOARD",
                    navLink("Stories", "#wall"),
                    navLink("Numbers", "#numbers"),
                    navCta("Start free", "https://switchboard.ai/start"),
                ),
                t("WALL OF LOVE", "label"),
                t("2,400 front desks, in their owners' words.", "h1"),
                t(
                    "Unedited, unpaid, and occasionally misspelled. What the trades say about the AI that answers their phone.",
                    "subtitle",
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(361, 1700, 1100), 0.6),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "wall",
            group(
                row(
                    testimonial(
                        "Booked $11K of work the first weekend. I was at my kid's game for all of it.",
                        "Ray Delgado",
                        "Delgado Plumbing, San Antonio",
                        "https://i.pravatar.cc/240?img=53",
                    ),
                    testimonial(
                        "My mother-in-law called to test it. She scheduled a tune-up. She doesn't have a furnace.",
                        "Kayla Brant",
                        "Brant Heating & Air, Tulsa",
                        "https://i.pravatar.cc/240?img=44",
                    ),
                ),
                row(
                    testimonial(
                        "Two years of voicemail guilt, gone in an afternoon.",
                        "Sam Okafor",
                        "Okafor Electric, Columbus",
                        "https://i.pravatar.cc/240?img=15",
                    ),
                    testimonial(
                        "It answers in Spanish better than my dispatcher did. He agrees.",
                        "Marisol Vega",
                        "Vega Roofing, Phoenix",
                        "https://i.pravatar.cc/240?img=47",
                    ),
                ),
            ),
        ),
        section(
            "fridge",
            group(
                t("STUCK TO THE FRIDGE", "label"),
                t("What the trades say", "h2"),
                row(
                    card(
                        t("The Saturday guy quit and nobody noticed for a month.", "h3"),
                        t("Dee Waller · Waller Septic, Boise", "caption"),
                    ),
                    card(
                        t("I stopped writing numbers on my arm at red lights.", "h3"),
                        t("Curt Boyle · Boyle Paving, Erie", "caption"),
                    ),
                ),
                pin(
                    w(
                        30,
                        card(
                            t("The after-hours calls just stopped ringing at my house.", "body"),
                            t("Marta Ilić · Ilić HVAC, Duluth", "caption"),
                        ),
                    ),
                    "start",
                    "end",
                    { dx: 90, dy: 104, rotate: -3, z: 1 },
                ),
                pin(
                    w(
                        30,
                        card(
                            t(
                                "Booked a water heater while I was under a sink. Didn't touch the phone.",
                                "body",
                            ),
                            t("Gene Park · Park Plumbing, Fresno", "caption"),
                        ),
                    ),
                    "center",
                    "end",
                    { dx: 150, dy: 122, rotate: 2, z: 1 },
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "numbers",
            row(
                stat("1.9M", "calls answered last quarter"),
                stat("2 sec", "median time to pick up"),
                stat("$140M", "booked for customers"),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "wall2",
            group(
                row(
                    testimonial(
                        "Hired a second crew because the calendar filled. That sentence would've been science fiction last year.",
                        "Dee Winters",
                        "Winters & Sons HVAC, Boise",
                        "https://i.pravatar.cc/240?img=60",
                    ),
                    testimonial(
                        "The after-hours calls it catches paid for the year by February.",
                        "Aldo Reyes",
                        "Reyes Septic, Fresno",
                        "https://i.pravatar.cc/240?img=12",
                    ),
                ),
                row(
                    testimonial(
                        "I listened to the recordings expecting to cringe. It's more patient than I am before coffee.",
                        "June Park",
                        "Park Electric, Portland",
                        "https://i.pravatar.cc/240?img=20",
                    ),
                    testimonial(
                        "Customers started complimenting 'the new hire.' We don't have a new hire.",
                        "Curtis Boone",
                        "Boone Garage Doors, Nashville",
                        "https://i.pravatar.cc/240?img=41",
                    ),
                ),
            ),
        ),
        section(
            "interlude",
            group(
                t("Every one of these calls used to ring out.", "h2"),
                t("The wall updates weekly; the misspellings stay in.", "caption"),
            ),
            { bleed: true, background: bgImage(pic(362, 1700, 1100), 0.6) },
        ),
        section(
            "trades",
            group(
                t("BY TRADE", "label"),
                row(
                    group(
                        t("Plumbing & septic", "h3"),
                        t("640 businesses · the after-hours champions", "caption"),
                    ),
                    group(
                        img(pic(363), 1.4),
                        t("HVAC & electrical", "h3"),
                        t("890 businesses · our largest trade", "caption"),
                    ),
                    group(
                        t("Roofing & exterior", "h3"),
                        t("410 businesses · the storm-season stress test", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "press",
            group(
                t("AND THE PRESS", "label"),
                quote(
                    "The rare AI product whose customers do the marketing unprompted, in their own punctuation.",
                    "Trade Tech Weekly · March 2026",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "cta",
            group(
                t("Your phone is ringing right now.", "h2"),
                t("Forward it for a week and read your own wall.", "subtitle"),
                button("Start free", "https://switchboard.ai/start", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(364, 1700, 1100), 0.55) },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Switchboard", "h3")),
                        fitW(t("The AI front desk for the trades.", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("MORE", "label")),
                        fitW(
                            linked("caption", ["switchboard.ai", "https://switchboard.ai"], " · ", [
                                "Fact sheet",
                                "https://switchboard.ai/press",
                            ]),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("ADD YOURS", "label")),
                        fitW(
                            linked("caption", [
                                "wall@switchboard.ai",
                                "mailto:wall@switchboard.ai",
                            ]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(365, 1700, 1100), 0.35),
);

export const solutionPage: ArtifactContent = web(
    "carbon",
    [
        section(
            "hero",
            group(
                siteNav(
                    "FLEETWISE",
                    navLink("Why", "#why"),
                    navLink("How", "#how"),
                    navLink("Proof", "#proof"),
                    navCta("Get the assessment", "#cta"),
                ),
                t("FLEETWISE FOR REGIONAL CARRIERS", "label"),
                t("Your margin lives or dies in the shop.", "h1"),
                t(
                    "For 50-to-500-truck carriers, one unplanned breakdown a week erases a lane's profit. This is what predictive maintenance looks like at your size.",
                    "subtitle",
                ),
                button("See your fleet's risk", "#cta", { size: "lg" }),
            ),
            {
                bleed: true,
                background: bgImage(pic(366, 1700, 1100), 0.58),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "why",
            group(
                t("WHY REGIONAL IS DIFFERENT", "label"),
                t("Too big to eyeball, too lean for a data team.", "h2"),
                bullets(
                    "Every truck matters: no float pool to absorb a dead unit",
                    "Two or three depots mean parts are always at the other one",
                    "The maintenance chief is also the safety officer and sometimes the driver",
                ),
            ),
        ),
        section(
            "how",
            split(
                60,
                group(
                    t("HOW IT LANDS", "label"),
                    t("Two weeks to first save, no headcount.", "h2"),
                    bullets(
                        "Week one: telematics connected, every unit scored",
                        "Week two: first flagged failures, work orders drafted to the right depot",
                        "Week six: planned work overtakes reactive for the first time",
                    ),
                ),
                img(pic(367), 0.82),
            ),
        ),
        section(
            "roi",
            row(
                stat("$760", "saved per truck, per avoided day down"),
                stat("23%", "of road calls were preventable"),
                stat("2 wks", "to live, no new hardware"),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
        section(
            "proof",
            group(
                testimonial(
                    "We used to staff for breakdowns. Now we staff for the schedule Fleetwise hands us the night before.",
                    "Carla Mendez",
                    "VP Maintenance, Meridian Freight",
                    "https://i.pravatar.cc/240?img=26",
                ),
            ),
        ),
        section(
            "fits",
            split(
                40,
                img(pic(368), 1.05),
                group(
                    t("FITS THE STACK YOU RUN", "label"),
                    t("Reads your telematics, writes to your shop.", "h2"),
                    checks(
                        "Samsara, Geotab, Motive, Verizon Connect: forty-minute connect",
                        "Work orders land in Fullbay or Fleetio, already routed",
                        "Parts availability from your supplier's live catalog",
                    ),
                ),
            ),
        ),
        section(
            "math",
            group(
                t("THE MATH, FOR YOUR CFO", "label"),
                table(
                    "Line,Typical 200-truck fleet,With Fleetwise\nRoadside events / yr,96,46\nAvg cost per event,$2.9K · tow + lane,$2.9K · fewer of them\nUnplanned downtime days,410,190\nAnnual impact,,$610K recovered",
                ),
            ),
        ),
        section(
            "proof2",
            group(
                testimonial(
                    "Our board asked why maintenance spend went down while uptime went up. First pleasant board question of my career.",
                    "Ray Osei",
                    "COO, Cedarline Logistics",
                    "https://i.pravatar.cc/240?img=15",
                ),
            ),
        ),
        section(
            "interlude",
            group(t("Every truck in the yard tonight is margin tomorrow.", "h2")),
            { bleed: true, background: bgImage(pic(369, 1700, 1100), 0.6) },
        ),
        section(
            "cta",
            group(
                t("Thirty minutes, your top 25 vehicles.", "h2"),
                t(
                    "Read-only access in, a ranked risk list out. No install, no commitment.",
                    "subtitle",
                ),
                button("Book the assessment", "https://fleetwise.io/assessment", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(370, 1700, 1100), 0.58) },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Fleetwise", "h3")),
                        fitW(t("Predictive maintenance for fleets.", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("RESOURCES", "label")),
                        fitW(
                            linked(
                                "caption",
                                ["The product sheet", "https://fleetwise.io/sheet"],
                                " · ",
                                ["ROI worksheet", "https://fleetwise.io/roi"],
                            ),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("TALK TO US", "label")),
                        fitW(
                            linked("caption", ["sales@fleetwise.io", "mailto:sales@fleetwise.io"]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(371, 1700, 1100), 0.35),
);

export const comparePage: ArtifactContent = web(
    "press",
    [
        section(
            "hero",
            group(
                siteNav(
                    "NORTHWIND",
                    navLink("Compare", "#compare"),
                    navLink("Switching", "#switch"),
                    navCta("Start free", "https://app.northwind.dev/signup"),
                ),
                t("NORTHWIND VS. THE BI YOU HAVE", "label"),
                t("An honest comparison, losses included.", "h1"),
                t(
                    "Legacy BI is powerful and you already paid for it. Here is exactly where Northwind wins, where it doesn't, and how to tell which one you need.",
                    "subtitle",
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(372, 1700, 1100), 0.6),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "compare",
            group(
                t("SIDE BY SIDE", "label"),
                table(
                    "What matters,Legacy BI,Northwind\nFirst dashboard,6 to 10 weeks,One afternoon\nWho builds,A BI developer,Whoever asks the question\nData freshness,Nightly batch,Streaming · always current\nViewers,Licensed per seat,Unlimited · free\nAnnual cost at 50 seats,$90K+,$2.4K",
                ),
            ),
        ),
        section(
            "honest",
            group(
                t("WHERE WE LOSE", "label"),
                t("Keep your warehouse tooling if this is you.", "h2"),
                bullets(
                    "You need governed semantic layers across 40 data teams",
                    "Your compliance regime requires on-premise deployment",
                    "You genuinely enjoy LookML, and we respect that",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "switch",
            group(
                t("SWITCHING", "label"),
                t("Two months of parallel running, on us.", "h2"),
                t(
                    "Every annual plan includes a migration engineer for your first month and both tools running side by side for two. You cut over when your team stops opening the old one, which is usually week three.",
                    "body",
                ),
            ),
        ),
        section(
            "proof",
            group(
                testimonial(
                    "We replaced a $90k BI contract and two spreadsheets with Northwind in an afternoon. Our whole company reads the same numbers now.",
                    "Priya Raman",
                    "VP Growth, Cedarworks",
                    "https://i.pravatar.cc/240?img=32",
                ),
            ),
        ),
        section(
            "migration",
            group(
                t("THE SWITCH, WEEK BY WEEK", "label"),
                table(
                    "Week,What happens,Who does it\n1,Sources connected · dashboards rebuilt,Your migration engineer\n2,Teams onboarded · old reports mapped,Together\n3,Parallel running · gaps closed,You + us on call\n4 to 8,Old tool quietly gathers dust,Nobody · that's the point",
                ),
            ),
        ),
        section(
            "checklist",
            split(
                40,
                img(pic(373), 1.05),
                group(
                    t("SHOULD YOU SWITCH?", "label"),
                    t("The honest checklist.", "h2"),
                    checks(
                        "Your analysts spend more time building reports than reading them",
                        "The word 'refresh' appears in your team's Slack weekly",
                        "You pay per viewer and it shows in who gets access",
                        "Nobody has opened the semantic layer docs since onboarding",
                    ),
                ),
            ),
        ),
        section(
            "proof2",
            group(
                testimonial(
                    "The parallel month made it a no-brainer. By week two the old tool's tab was just muscle memory.",
                    "Marcus Chen",
                    "Data Lead, Norrøn",
                    "https://i.pravatar.cc/240?img=53",
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
        section(
            "numbers",
            row(
                stat("312", "teams switched this year"),
                stat("19 days", "median time to full cutover"),
                stat("$61K", "median first-year savings"),
            ),
        ),
        section(
            "cta",
            group(
                t("Run them side by side. Keep the winner.", "h2"),
                button("Start free, no card", "https://app.northwind.dev/signup", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(374, 1700, 1100), 0.6) },
        ),
        section(
            "gallery",
            group(
                t("LIFE AFTER THE SWITCH", "label"),
                row(
                    group(
                        img(pic(375), 1.4),
                        t("Monday metrics over coffee, not over tickets", "caption"),
                    ),
                    group(img(pic(376), 1.4), t("The report that writes itself now", "caption")),
                    group(
                        img(pic(377), 1.4),
                        t("The BI backlog meeting, cancelled forever", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Northwind", "h3")),
                        fitW(t("Analytics for teams without a data team.", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("KEEP READING", "label")),
                        fitW(
                            linked("caption", ["Pricing", "https://northwind.dev/pricing"], " · ", [
                                "The changelog",
                                "https://northwind.dev/changelog",
                            ]),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("TALK TO US", "label")),
                        fitW(
                            linked("caption", [
                                "hello@northwind.dev",
                                "mailto:hello@northwind.dev",
                            ]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(378, 1700, 1100), 0.3),
);

// launch & market: the campaign, the brand, the announcement, and the paper behind them

export const campaignPitch: ArtifactContent = deck(
    "moss",
    [
        section(
            "cover",
            group(
                t("AER × STUDIO NORTH · SPRING CAMPAIGN", "label"),
                t("Open a window.", "h1"),
                t(
                    "A campaign proposal for Aer's first spring: the season people finally let the outside in, and the moment to tell them what their air has been all winter.",
                    "subtitle",
                ),
                t("Prepared for the Aer brand team · February 2026", "caption"),
            ),
            { background: bgImage(pic(379, 1700, 1100), 0.5) },
        ),
        section(
            "insight",
            split(
                60,
                group(
                    t("01 · THE INSIGHT", "label"),
                    t("Spring cleaning never includes the air.", "h2"),
                    t(
                        "People scrub every surface in April and breathe the same winter air for another month. The category talks about particles; nobody talks about the ritual. Aer can own the moment the windows open.",
                        "body",
                    ),
                ),
                img(pic(380), 0.82),
            ),
        ),
        section(
            "idea",
            group(
                t("02 · THE IDEA", "label"),
                t("First breath of spring.", "h1"),
                t(
                    "One line, three executions, every channel: the year's first deep breath, brought indoors.",
                    "subtitle",
                ),
            ),
            { background: bgImage(pic(381, 1700, 1100), 0.5) },
        ),
        section(
            "executions",
            group(
                t("03 · THREE EXECUTIONS", "label"),
                row(
                    group(
                        img(pic(382), 1.4),
                        t("Film · 30s", "h3"),
                        t(
                            "A window opens in twelve homes, one continuous shot, one breath.",
                            "caption",
                        ),
                    ),
                    group(
                        img(pic(383), 1.4),
                        t("Out-of-home", "h3"),
                        t(
                            "Transit and gym takeovers where the air is worst and the point lands hardest.",
                            "caption",
                        ),
                    ),
                    group(
                        img(pic(384), 1.4),
                        t("Social", "h3"),
                        t(
                            "Creators run the two-week air experiment, data on screen, no script.",
                            "caption",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "channels",
            group(
                t("04 · WHERE IT RUNS", "label"),
                t("Six weeks, heaviest where spring arrives first.", "h2"),
                table(
                    "Channel,Weight,Flight\nStreaming & online film,45%,Weeks 1 to 6\nOut-of-home · 4 metros,30%,Weeks 2 to 5\nCreator & social,20%,Weeks 1 to 4\nEarned & PR,5%,Launch week",
                ),
            ),
        ),
        section(
            "numbers",
            row(
                stat("$1.2M", "recommended media budget"),
                stat("38M", "planned impressions"),
                stat("4", "launch metros, then national"),
            ),
        ),
        section(
            "film",
            split(
                60,
                group(
                    t("THE FILM, IN ONE PARAGRAPH", "label"),
                    t("Twelve homes, one continuous shot.", "h2"),
                    t(
                        "A camera drifts through twelve real homes at dawn as windows open one by one: a kid's room, a bakery flat, a night nurse coming home. No voiceover until the last frame: the year's first deep breath, brought indoors.",
                        "body",
                    ),
                    t("Director shortlist attached · two are spring-available", "caption"),
                ),
                img(pic(385), 0.82),
            ),
        ),
        section(
            "measure",
            group(
                t("HOW WE'LL KNOW IT WORKED", "label"),
                table(
                    "Metric,Baseline,Target\nAided brand awareness,11%,19%\nBranded search volume,Index 100,Index 160\nPre-order attach from campaign traffic,2.1%,3.4%",
                ),
            ),
        ),
        section(
            "team",
            group(
                t("WHO MAKES IT", "label"),
                row(
                    group(
                        t("Studio North", "h3"),
                        t("Idea, film, and craft · this deck", "caption"),
                    ),
                    group(
                        t("Meridian Media", "h3"),
                        t("Planning and buying · the flight plan", "caption"),
                    ),
                    group(
                        t("Aer brand team", "h3"),
                        t("Voice, approvals, and the product truth", "caption"),
                    ),
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "ask",
            split(
                40,
                img(pic(386), 0.86),
                group(
                    t("05 · THE ASK", "label"),
                    t("Approve the idea; spring won't wait.", "h2"),
                    t(
                        "Sign off by March 1 and the film shoots in three weeks, live by the first warm weekend. We bring the director's treatment and the media plan to Thursday's review.",
                        "body",
                    ),
                    button("Approve & book the shoot"),
                ),
            ),
            { background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(387, 1700, 1100), 0.3),
);

export const brandGuidelines: ArtifactContent = deck(
    "gazette",
    [
        section(
            "cover",
            group(
                t("ATLAS COFFEE ROASTERS · BRAND GUIDELINES v2.0", "label"),
                t("How Atlas looks, sounds, and pours.", "h1"),
                t(
                    "The rules that keep a hundred hands making one brand: identity, voice, color, type, and the photography that smells like the roastery.",
                    "subtitle",
                ),
                t("Maintained by Foldwork · For everyone who touches the brand", "caption"),
            ),
            { background: bgImage(pic(388, 1700, 1100), 0.55) },
        ),
        section(
            "logo",
            split(
                60,
                group(
                    t("01 · THE MARK", "label"),
                    t("The wordmark travels; the roundel stays home.", "h2"),
                    bullets(
                        "Wordmark on bags, storefronts, and anything wider than it is tall",
                        "Roundel for stamps, caps, and spaces under 40px",
                        "Clear space equals the height of the A, always",
                        "Never stretched, tilted, outlined, or gradiented, even in a hurry",
                    ),
                ),
                img(pic(389), 0.82),
            ),
        ),
        section(
            "color",
            group(
                t("02 · COLOR", "label"),
                t("Roast, crema, and one loud orange.", "h2"),
                t(
                    "Ninety percent of everything is Roast (deep brown) on Crema (warm off-white). The orange is the espresso shot: one accent per surface, never a background, never in body text.",
                    "body",
                ),
            ),
            { background: bgTone("accent") },
        ),
        section(
            "type",
            split(
                40,
                img(pic(390), 1.05),
                group(
                    t("03 · TYPE", "label"),
                    t("A serif that argues, a sans that pours.", "h2"),
                    t(
                        "Headlines set in Tiempos Semibold, tight and confident. Everything functional (menus, bags, buttons) runs National in two weights. If a third font appears, it is a bug.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "voice",
            group(
                t("04 · VOICE", "label"),
                t("Plain words, strong opinions, no foam.", "h2"),
                table(
                    "We say,We never say\nGood coffee · roasted Tuesday,Artisanal · hand-crafted\nTastes like cherry and cola,Notes of terroir\nFrom farms we can name,Ethically curated\nTry it black first,Elevate your ritual",
                ),
            ),
        ),
        section(
            "photo",
            group(
                t("05 · PHOTOGRAPHY", "label"),
                t("Shot in the room, not the studio.", "h2"),
                row(
                    group(img(pic(391), 1.4), t("Beans, close and honest", "caption")),
                    group(img(pic(392), 1.4), t("Hands and machines at work", "caption")),
                    group(img(pic(393), 1.4), t("Morning light, real counters", "caption")),
                ),
            ),
        ),
        section(
            "layout",
            split(
                60,
                group(
                    t("07 · LAYOUT", "label"),
                    t("Whitespace is a brand asset.", "h2"),
                    bullets(
                        "One focal point per surface; the eye should never negotiate",
                        "Margins scale with the format: generous on posters, honest on bags",
                        "When a layout feels empty, it is probably finished",
                    ),
                ),
                img(pic(394), 0.82),
            ),
        ),
        section(
            "motion",
            group(
                t("08 · MOTION & SOUND", "label"),
                t("Slow pours, real rooms.", "h2"),
                t(
                    "Video moves at pour speed: no whip cuts, no drone shots, no stock. The sound bed is the roastery itself, recorded on Tuesdays. If a clip could sell sneakers, reshoot it.",
                    "body",
                ),
            ),
        ),
        section(
            "dontlist",
            group(
                t("09 · THE DON'T LIST", "label"),
                bullets(
                    "No coffee puns in headlines; the beans are the wit",
                    "No stock photography of laughing people holding mugs",
                    "No seasonal logo costumes; the roundel does not wear a Santa hat",
                    "No gradients arrived from other categories",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "apply",
            split(
                40,
                img(pic(395), 0.86),
                group(
                    t("06 · IN USE", "label"),
                    t("When in doubt, less label, more coffee.", "h2"),
                    t(
                        "Bags carry the wordmark, the origin, and the roast date; nothing else. Menus read top to bottom in under ten seconds. Ask the brand desk before inventing anything new, and they will usually say no, kindly.",
                        "body",
                    ),
                    linked("caption", "Assets & questions: ", [
                        "brand@atlascoffee.co",
                        "mailto:brand@atlascoffee.co",
                    ]),
                ),
            ),
            { background: bgTone("tint") },
        ),
    ],
    bgImage(pic(396, 1700, 1100), 0.3),
);

export const announcementKeynote: ArtifactContent = deck(
    "noir",
    [
        section(
            "tease",
            group(
                t("VANTA · SPRING EVENT", "label"),
                t("What if your computer went quiet?", "h1"),
                t("A short announcement. One product, one price, one date.", "caption"),
            ),
            { background: bgImage(pic(397, 1700, 1100), 0.68) },
        ),
        section(
            "reveal",
            group(
                t("INTRODUCING", "label"),
                t("Vanta 1.0", "h1"),
                t(
                    "The workspace that disappears. One thing at a time, in perfect quiet, on hardware you already own.",
                    "subtitle",
                ),
            ),
            { background: bgImage(pic(398, 1700, 1100), 0.5) },
        ),
        section(
            "one",
            split(
                60,
                group(
                    t("ONE THING AT A TIME", "label"),
                    t("Your day, single file.", "h2"),
                    t(
                        "Pull a task into focus and the rest of the world dims. When you finish, the next thing rises on its own. No tabs, no badges, no feed.",
                        "body",
                    ),
                    t("Works with the apps you keep; ignores the ones that keep you.", "caption"),
                ),
                img(pic(399), 0.82),
            ),
        ),
        section(
            "two",
            split(
                40,
                img(pic(400), 1.05),
                group(
                    t("PRIVATE BY DESIGN", "label"),
                    t("Everything runs on your device.", "h2"),
                    t(
                        "Your notes, your patterns, your rhythm: none of it leaves the machine. The AI that drafts and summarizes works offline, which is the only place it should.",
                        "body",
                    ),
                    t("Runs on any laptop from this decade.", "caption"),
                ),
            ),
        ),
        section(
            "price",
            group(
                t("ONE PRICE", "label"),
                t("$96 a year. No tiers, no seats, no meetings about tiers.", "h2"),
                t("Free for students, forever.", "caption"),
            ),
            { background: bgTone("contrast") },
        ),
        section(
            "three",
            split(
                60,
                group(
                    t("THE QUIET ASSISTANT", "label"),
                    t("It drafts; you decide.", "h2"),
                    t(
                        "Summaries, replies, and next steps appear as suggestions in the margin, never as interruptions. Accept with one key, ignore forever with none.",
                        "body",
                    ),
                    t("Every suggestion carries its source; nothing is invented.", "caption"),
                ),
                img(pic(401), 0.82),
            ),
        ),
        section(
            "witness",
            group(
                quote(
                    "The first computer in a decade that made my day feel longer instead of louder.",
                    "Beta tester no. 214 · six months in",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "numbers",
            row(
                stat("31,400", "on the waitlist today"),
                stat("18 mo", "of beta, in production use"),
                stat("0", "notifications shipped, ever"),
            ),
        ),
        section(
            "date",
            group(
                t("THE DATE", "label"),
                t("December 4, everywhere.", "h1"),
                t("Invites go to the waitlist first. The quiet is almost ready.", "subtitle"),
                button("Join the waitlist", "https://vanta.app/waitlist", { size: "lg" }),
            ),
            { background: bgImage(pic(402, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(403, 1700, 1100), 0.3),
);

export const launchBriefing: ArtifactContent = deck(
    "cement",
    [
        section(
            "cover",
            group(
                t("TIDEPOOL · INTERNAL · LAUNCH BRIEFING", "label"),
                t("We go public on September 15.", "h1"),
                t(
                    "Everything every team needs for launch week: what ships, who owns what, what we say, and what we do when something breaks.",
                    "subtitle",
                ),
                t("All-hands briefing · September 2 · 25 minutes", "caption"),
            ),
            { background: bgImage(pic(404, 1700, 1100), 0.6) },
        ),
        section(
            "ships",
            split(
                60,
                group(
                    t("01 · WHAT SHIPS", "label"),
                    t("Three things, one story.", "h2"),
                    bullets(
                        "Public launch: self-serve signup opens to everyone",
                        "Shopify featured listing goes live the same morning",
                        "Pricing v2: Free, Growth $149, Pro $399",
                    ),
                ),
                img(pic(405), 0.82),
            ),
        ),
        section(
            "owners",
            group(
                t("02 · WHO OWNS WHAT", "label"),
                table(
                    "Workstream,Owner,Done by\nProduct & onboarding,Priya Anand,Sept 12\nLaunch comms & press,Tomas Lindqvist,Sept 14\nSupport surge · 3 shifts,Renee Okoro,Sept 15\nCommunity & founders' Slack,Dario Vella,Launch morning",
                ),
            ),
        ),
        section(
            "message",
            group(
                t("03 · WHAT WE SAY", "label"),
                t("The inventory brain for growing brands.", "h2"),
                t(
                    "One sentence, everywhere: Tidepool forecasts demand and tells you exactly what to reorder, without an ERP project. If a journalist asks about the enterprise, we are cheerfully not for them.",
                    "body",
                ),
            ),
            { background: bgImage(pic(406, 1700, 1100), 0.65) },
        ),
        section(
            "day",
            group(
                t("04 · LAUNCH DAY, HOUR BY HOUR", "label"),
                table(
                    "Time,What happens\n6:00,Flag flips · smoke tests run\n7:00,Press embargo lifts · founder post goes live\n9:00,Shopify feature confirmed · community AMA opens\n12:00,First metrics check · scale decision\n17:00,Day-one retro · thanks · go home",
                ),
            ),
        ),
        section(
            "breaks",
            group(
                t("05 · WHEN SOMETHING BREAKS", "label"),
                t("War room first, heroics never.", "h2"),
                bullets(
                    "#launch-room is the only channel that matters that week",
                    "Rollback beats hotfix before noon; after noon, page Priya",
                    "Customers hear from us before the status page does",
                ),
            ),
        ),
        section(
            "support",
            split(
                40,
                img(pic(407), 1.05),
                group(
                    t("06 · SUPPORT'S WEEK", "label"),
                    t("Three shifts, no heroes.", "h2"),
                    bullets(
                        "Surge staffing Mon to Wed: response target stays under 2 hours",
                        "The top-20 answers doc is law; escalate the 21st question",
                        "Every bug report gets a ticket number in the first reply",
                    ),
                ),
            ),
        ),
        section(
            "metrics",
            group(
                t("07 · WHAT WE WATCH", "label"),
                table(
                    "Metric,Green,Yellow,Red\nSignup error rate,Under 0.5%,0.5 to 2%,Over 2% · rollback\nTime to first forecast,Under 10 min,10 to 20,Over 20 · war room\nSupport response,Under 2 hrs,2 to 4,Over 4 · all hands",
                ),
            ),
        ),
        section(
            "after",
            group(
                t("08 · THE WEEK AFTER", "label"),
                t("The launch is the start line.", "h2"),
                t(
                    "Wednesday: first-cohort read. Friday: the retro, blameless and written down. The following Monday: back to the roadmap, which has been patiently waiting.",
                    "body",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "close",
            group(
                t("Two years of work. One good morning.", "h2"),
                t("Questions now, or in #launch-room. Thank you for building this.", "subtitle"),
            ),
            { background: bgImage(pic(408, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(409, 1700, 1100), 0.3),
);

export const releaseNotes: ArtifactContent = doc(
    "press",
    [
        section(
            "head",
            group(
                t("NORTHWIND · RELEASE NOTES", "label"),
                t("August 2026: the alerts release", "h1"),
                t(
                    "One big thing, eleven small ones, and two goodbyes. Everything that shipped this month, and what it changes for your team.",
                    "subtitle",
                ),
                t("Published September 1 · Every account already has all of it", "caption"),
            ),
            { background: bgImage(pic(410, 1700, 1100), 0.6) },
        ),
        section(
            "feature",
            split(
                60,
                group(
                    t("THE BIG ONE", "label"),
                    t("Alerts that watch the number for you.", "h2"),
                    t(
                        "Set a threshold on any metric and Northwind pings Slack or email the moment it crosses, with the chart attached and the likely cause ranked. Signups dip on a Tuesday night, you know Tuesday night.",
                        "body",
                    ),
                    t(
                        "Available on every plan · Alerts live under any chart's bell icon",
                        "caption",
                    ),
                ),
                img(pic(411), 0.82),
            ),
        ),
        section(
            "improvements",
            group(
                t("ALSO SHIPPED", "label"),
                bullets(
                    "Dashboards load 2.1× faster on accounts with 50+ charts",
                    "Funnels support custom windows: hour, week, or your fiscal month",
                    "CSV export keeps your column order, at last",
                    "Dark mode no longer flashes white while loading, which we regret took this long",
                ),
            ),
        ),
        section(
            "fixes",
            group(
                t("FIXED", "label"),
                table(
                    "What broke,Where,Status\nTimezone drift on weekly rollups,Charts,Fixed\nDuplicate members after SSO rename,Admin,Fixed\nSafari copy button doing nothing,Everywhere,Fixed · sorry Safari",
                    true,
                    1,
                ),
            ),
        ),
        section(
            "sunset",
            group(
                t("RETIRING", "label"),
                t("Two goodbyes, both with a bridge.", "h3"),
                t(
                    "Legacy embeds stop rendering October 15; the new embed is one attribute change. The v1 API sunsets January 1 and every v1 call already returns a header telling you its v2 twin.",
                    "body",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "alerts2",
            split(
                40,
                img(pic(412), 1.05),
                group(
                    t("HOW TEAMS USE IT", "label"),
                    t("Three alerts worth copying.", "h2"),
                    bullets(
                        "Signups vs. 7-day average, into #growth, threshold 15%",
                        "Checkout errors above zero, into the on-call phone, immediately",
                        "The Friday digest: every metric that moved double digits this week",
                    ),
                ),
            ),
        ),
        section(
            "adoption",
            row(
                stat("41%", "of workspaces set an alert in week one"),
                stat("2.1×", "faster dashboards on big accounts"),
                stat("214", "community upvotes on the Safari fix"),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "voice",
            group(
                quote(
                    "The alert caught a pricing bug at 11pm that would have cost us the weekend. This feature paid for the year in one night.",
                    "Tom Becker · Founder, Haloway",
                ),
            ),
        ),
        section(
            "gallery",
            group(
                t("SHIP WEEK, DOCUMENTED", "label"),
                row(
                    group(
                        img(pic(413), 1.4),
                        t("The alert spec, drafted on paper first", "caption"),
                    ),
                    group(
                        img(pic(414), 1.4),
                        t("The team read-through before the post", "caption"),
                    ),
                    group(img(pic(415), 1.4), t("2am, the Safari fix finally landing", "caption")),
                ),
            ),
        ),
        section(
            "next",
            group(
                t("NEXT MONTH", "label"),
                t("Saved views for every team, and something for the CFO.", "body"),
                linked("caption", "The full changelog lives at ", [
                    "northwind.dev/changelog",
                    "https://northwind.dev/changelog",
                ]),
            ),
        ),
    ],
    bgImage(pic(416, 1700, 1100), 0.3),
);

export const pressKit: ArtifactContent = doc(
    "moss",
    [
        section(
            "head",
            group(
                t("PRESS KIT · EMBARGO MARCH 4, 6AM PT", "label"),
                t("Aer launches the purifier you forget is on", "h1"),
                t(
                    "Aer One reads the room and clears it in twelve minutes, at the volume of a library. Pre-orders open today at $249; units ship in March.",
                    "subtitle",
                ),
                t("Contact: press@aerone.com · Assets: aerone.com/press", "caption"),
            ),
            { background: bgImage(pic(417, 1700, 1100), 0.55) },
        ),
        section(
            "facts",
            row(
                stat("99.97%", "of particles down to 0.1 microns"),
                stat("21 dB", "quieter than a library"),
                stat("$249", "pre-order · ships March"),
            ),
        ),
        section(
            "story",
            group(
                t("THE STORY", "label"),
                t(
                    "Indoor air is two to five times more polluted than the street outside, and the machines built to fix it are ugly, loud, and confusing enough that people turn them off. Aer's founding team (ex-Dyson, ex-Nest) spent three years on a purifier with no app requirement and one glowing ring: amber while it works, white when the air is clear. You plug it in and stop thinking about it, which was the whole idea.",
                    "body",
                ),
            ),
        ),
        section(
            "quotes",
            group(
                t("QUOTABLE", "label"),
                quote(
                    "We built the appliance version of a deep breath. It should disappear into the room and take the worry with it.",
                    "Mara Chen, co-founder & CEO",
                ),
                quote(
                    "I stopped waking up congested within a week. I didn't expect to feel the difference, but the whole house notices when it's off.",
                    "Dr. Lena Osei · pulmonologist, early tester",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "assets",
            group(
                t("WHAT'S IN THE KIT", "label"),
                table(
                    "Asset,Format,Where\nProduct photography · 14 shots,JPG + RAW,aerone.com/press\nFounder portraits,JPG,aerone.com/press\nB-roll · 90 seconds,ProRes,On request\nSpec sheet,PDF,In this kit",
                ),
                t("Everything is cleared for editorial use with credit to Aer.", "caption"),
            ),
        ),
        section(
            "product",
            split(
                60,
                group(
                    t("THE PRODUCT, FOR THE CAPTION", "label"),
                    t("One ring, no app required.", "h2"),
                    t(
                        "Aer One senses the room sixty times a second and clears a sealed 400 sq ft kitchen in twelve minutes. The ring fades amber to white as the air clears, which is the entire interface, and the reason reviewers keep calling it furniture.",
                        "body",
                    ),
                ),
                img(pic(418), 0.82),
            ),
        ),
        section(
            "timeline",
            group(
                t("THE STORY SO FAR", "label"),
                table(
                    "When,What\n2023,Founded by the ex-Dyson airflow team\n2024,Seed round · 1400-home beta begins\n2025,The ring interface locks · CES honoree\nMarch 2026,Aer One ships",
                ),
            ),
        ),
        section(
            "angles",
            group(
                t("THREE ANGLES THAT FILE WELL", "label"),
                bullets(
                    "The anti-app appliance: design's quiet rebellion against screens",
                    "Indoor air is the pollution nobody measures; the numbers are wild",
                    "Hardware that ships on time, from a team that has done it twice",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "gallery",
            group(
                t("FROM THE PHOTO KIT", "label"),
                row(
                    group(
                        img(pic(419), 1.4),
                        t("The sensor array, sixty reads a second", "caption"),
                    ),
                    group(
                        img(pic(420), 1.4),
                        t("The teardown shot reviewers request first", "caption"),
                    ),
                    group(img(pic(421), 1.4), t("Sleep mode, in its natural habitat", "caption")),
                ),
            ),
        ),
        section(
            "contact",
            group(
                t("Talk to us.", "h2"),
                linked(
                    "body",
                    ["press@aerone.com", "mailto:press@aerone.com"],
                    " · interviews with the founders available launch week · ",
                    ["aerone.com/press", "https://aerone.com/press"],
                ),
            ),
            { background: bgImage(pic(422, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(423, 1700, 1100), 0.3),
);

export const launchPlaybook: ArtifactContent = doc(
    "cement",
    [
        section(
            "head",
            group(
                t("TIDEPOOL · LAUNCH PLAYBOOK", "label"),
                t("Thirty days out, thirty days back", "h1"),
                t(
                    "The working checklist for the September 15 launch: every workstream, every owner, every date, and the go/no-go bar we hold ourselves to.",
                    "subtitle",
                ),
                t("Living document · Owned by Priya · Updated Fridays", "caption"),
            ),
            { background: bgImage(pic(424, 1700, 1100), 0.55) },
        ),
        section(
            "tminus",
            group(
                t("T-MINUS 30 TO 8", "label"),
                table(
                    "When,What,Owner\nT-30,Pricing v2 final · billing tested with real cards,Priya\nT-21,Press list locked · embargo briefings booked,Tomas\nT-14,Load test at 10× signup rate,Marco\nT-10,Support macros & surge shifts staffed,Renee\nT-8,Feature flag rehearsal · full dry run,Everyone",
                ),
            ),
        ),
        section(
            "week",
            group(
                t("LAUNCH WEEK", "label"),
                table(
                    "Day,What,Bar\nT-3,Go/no-go · all workstreams green,No red · no maybes\nT-1,Freeze · only launch-critical merges,CTO approves each\nT-0,Flip at 6am · press at 7 · AMA at 9,Smoke tests pass\nT+1,Metrics review · scale or steady call,Error rate under 0.5%",
                ),
            ),
        ),
        section(
            "gonogo",
            group(
                t("THE GO/NO-GO BAR", "label"),
                checks(
                    "Billing charges and refunds correctly in production",
                    "Signup to first forecast under ten minutes, tested by someone who didn't build it",
                    "Support can answer the top 20 questions without engineering",
                    "Rollback rehearsed and under five minutes",
                ),
            ),
            { background: bgTone("contrast") },
        ),
        section(
            "after",
            group(
                t("T-PLUS 7 TO 30", "label"),
                bullets(
                    "T+7: first cohort retention read · pricing objections logged",
                    "T+14: launch retro · what we keep, what we never do again",
                    "T+30: decide the next bet from real usage, not the roadmap we guessed",
                ),
            ),
        ),
        section(
            "comms",
            split(
                60,
                group(
                    t("THE COMMS LADDER", "label"),
                    t("Who hears what, in which order.", "h2"),
                    bullets(
                        "T-7: beta customers get the personal note and the founder's cell",
                        "T-3: waitlist hears the date; replies go to a staffed inbox",
                        "T-0 6:59am: the embargo lifts and the founder post goes up at 7:01",
                    ),
                ),
                img(pic(425), 0.82),
            ),
        ),
        section(
            "risks",
            group(
                t("THE RISK REGISTER", "label"),
                table(
                    "Risk,Likelihood,The move\nSignup surge past load test,Medium,Queue page ready · scale plan rehearsed\nPricing confusion in press,Medium,One-pager pre-briefed to every desk\nShopify feature slips,Low,Launch stands alone · feature becomes week-two news",
                ),
            ),
        ),
        section(
            "owners2",
            group(
                t("ONE PAGE OF PHONE NUMBERS", "label"),
                t(
                    "The war-room card lists every owner, their backup, and the decision each is allowed to make alone. It is printed, laminated, and taped inside the office door, because launch-day wifi is a risk on the register too.",
                    "body",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "gallery",
            group(
                t("SCENES FROM THE LAST DRY RUN", "label"),
                row(
                    group(img(pic(426), 1.4), t("Retail traffic, simulated at 10×", "caption")),
                    group(
                        img(pic(427), 1.4),
                        t("The war room, calm by rehearsal three", "caption"),
                    ),
                    group(
                        img(pic(428), 1.4),
                        t("The launch wall, color-coded and argued over", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "close",
            group(
                t("A launch is a Tuesday if the list is done.", "h2"),
                t(
                    "Anything not on this list does not block. Add it Friday or let it go.",
                    "caption",
                ),
            ),
            { background: bgImage(pic(429, 1700, 1100), 0.6) },
        ),
    ],
    bgImage(pic(430, 1700, 1100), 0.28),
);

export const messagingGuide: ArtifactContent = doc(
    "cement",
    [
        section(
            "head",
            group(
                t("TIDEPOOL · MESSAGING GUIDE", "label"),
                t("What we say, to whom, in which words", "h1"),
                t(
                    "The positioning, the three pillars, and the exact sentences that carry them. If marketing, sales, and the founder sound alike, this document is working.",
                    "subtitle",
                ),
                t("v3 · Post-launch edition · Owned by brand", "caption"),
            ),
            { background: bgImage(pic(431, 1700, 1100), 0.6) },
        ),
        section(
            "positioning",
            group(
                t("THE POSITIONING", "label"),
                quote(
                    "For operators at growing multi-channel brands, Tidepool is the inventory platform that forecasts demand and flags stockouts before they happen, without an ERP project or a six-figure contract.",
                    "Say it whole; it falls apart in pieces",
                ),
            ),
        ),
        section(
            "pillars",
            group(
                t("THREE PILLARS, WITH PROOF", "label"),
                row(
                    group(
                        t("See it coming", "h3"),
                        t(
                            "Forecasts per SKU per channel · 94% four-week accuracy across the beta",
                            "caption",
                        ),
                    ),
                    group(
                        t("Act in one tap", "h3"),
                        t("Reorders drafted to par · POs out in minutes, not Mondays", "caption"),
                    ),
                    group(
                        t("Live by lunch", "h3"),
                        t("40-minute connect · no consultant · first forecast same day", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "words",
            group(
                t("THE WORDS", "label"),
                table(
                    "We say,We never say\nInventory brain,AI-powered platform\nKnow what to reorder,Optimize your supply chain\nBuilt for brands · not the enterprise,Enterprise-grade\nLive in an afternoon,Seamless onboarding",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "audiences",
            group(
                t("BY AUDIENCE", "label"),
                bullets(
                    "Operators: lead with the 2am spreadsheet; they have all been in it",
                    "Founders: lead with margin recovered; stockouts read as growth pain",
                    "Press: lead with the anti-ERP angle; David and Goliath still files",
                ),
            ),
        ),
        section(
            "objections",
            group(
                t("THE OBJECTION DRILLS", "label"),
                table(
                    "They say,We say\nWe already have an ERP,Keep it · Tidepool runs beside it and pays for itself first\nAI forecasts feel risky,Every number shows its inputs · no black boxes\nWe're too small,If you juggle three channels · you're exactly the size",
                ),
            ),
        ),
        section(
            "story",
            split(
                40,
                img(pic(432), 1.05),
                group(
                    t("THE STORY WE TELL", "label"),
                    t("The 2am spreadsheet.", "h2"),
                    t(
                        "Every operator has one: the reorder sheet checked in bed, the stockout discovered by a customer. Open with it and the room nods; that nod is the pipeline.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "voice2",
            group(
                t("PROOF IN THE WILD", "label"),
                quote(
                    "Their landing page read like our ops standup. We booked the demo before the coffee finished.",
                    "Operator, 9-figure DTC brand · sales call, May",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "field",
            split(
                40,
                img(pic(433), 1.05),
                group(
                    t("THE MESSAGE, IN THE WILD", "label"),
                    t("Where the words go to work.", "h2"),
                    t(
                        "The positioning runs unchanged from the homepage to the sales deck to the booth backdrop. When a prospect repeats it back in their own words on a call, log the phrasing; the guide's next edition is built from those.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "close",
            group(
                t("One voice, many mouths.", "h2"),
                t(
                    "New claim? It needs a number and a customer behind it before it ships. Bring both to brand.",
                    "caption",
                ),
            ),
            { background: bgImage(pic(434, 1700, 1100), 0.6) },
        ),
    ],
    bgImage(pic(435, 1700, 1100), 0.3),
);

export const pricingPage: ArtifactContent = web(
    "press",
    [
        section(
            "hero",
            group(
                siteNav(
                    "NORTHWIND",
                    navLink("Plans", "#plans"),
                    navLink("Compare", "#detail"),
                    navLink("FAQ", "#faq"),
                    navCta("Start free", "https://app.northwind.dev/signup"),
                ),
                t("PRICING", "label"),
                t("Simple on purpose.", "h1"),
                t(
                    "Three plans, unlimited viewers on all of them, and a free tier that stays free. You pay when the team grows, not when curiosity does.",
                    "subtitle",
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(436, 1700, 1100), 0.62),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "plans",
            row(
                { align: "start" },
                pricing(
                    "FREE",
                    "$0",
                    "For a side project",
                    ["3 data sources", "Unlimited viewers", "7-day history", "Community support"],
                    button("Start free", "https://app.northwind.dev/signup"),
                ),
                pricing(
                    "TEAM",
                    "$49",
                    "Per month, for a growing startup",
                    [
                        "15 data sources",
                        "Alerts and Slack digests",
                        "12-month history",
                        "Email support",
                    ],
                    button("Start a trial", "https://app.northwind.dev/signup", {
                        variant: "outline",
                    }),
                ),
                pricing(
                    "BUSINESS",
                    "$199",
                    "Per month, for a scaling company",
                    [
                        "Unlimited sources",
                        "SSO and audit log",
                        "Unlimited history",
                        "Named support engineer",
                    ],
                    button("Talk to us", "mailto:sales@northwind.dev", { variant: "outline" }),
                ),
            ),
        ),
        section(
            "detail",
            group(
                t("THE FINE PRINT, LARGE", "label"),
                table(
                    "What,Free,Team,Business\nViewers,Unlimited,Unlimited,Unlimited\nEditors,2,10,Unlimited\nAlerts,·,Yes,Yes\nSSO & audit log,·,·,Yes\nAnnual discount,·,2 months,2 months",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "quote",
            group(
                testimonial(
                    "We put the whole company on viewers for free and pay for ten editors. Our BI bill fell 97% and usage went up.",
                    "Tom Becker",
                    "Founder, Haloway",
                    "https://i.pravatar.cc/240?img=12",
                ),
            ),
        ),
        section(
            "faq",
            group(
                t("QUESTIONS, ANSWERED", "label"),
                faq(
                    "collapsible",
                    [
                        [
                            "Is the free plan really free?",
                            "Yes, and permanently: three sources, unlimited viewers, no trial clock and no card. We only charge when you outgrow it.",
                        ],
                        [
                            "What counts as a viewer?",
                            "Anyone who reads dashboards without editing them. We never charge for reading; a metric nobody can see is not worth collecting.",
                        ],
                        [
                            "Can I change plans anytime?",
                            "Up, down, or off, in one click, prorated to the day. Downgrades keep your data; it just pauses past your plan's history window.",
                        ],
                        [
                            "Do you offer discounts?",
                            "Two months free on annual billing, 50% off for nonprofits and education, and the free plan for everyone else.",
                        ],
                    ],
                    true,
                ),
            ),
        ),
        section(
            "calculator",
            split(
                60,
                group(
                    t("WHAT TEAMS ACTUALLY PAY", "label"),
                    t("Median bill: $49. Yes, really.", "h2"),
                    t(
                        "Most teams live on Team for their first two years; the ones who upgrade do it for SSO, not limits. Nobody has ever hit the viewer cap, because there isn't one.",
                        "body",
                    ),
                ),
                img(pic(437), 0.82),
            ),
        ),
        section(
            "compare2",
            group(
                t("AGAINST THE ALTERNATIVES", "label"),
                table(
                    "Annual cost at 50 people,Them,Northwind\nLegacy BI,$90K+,$2.4K\nSpreadsheet chaos,Free · plus one analyst's sanity,$2.4K\nDoing nothing,Unmeasured · expensive,$0 to start",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "guarantee",
            group(
                t("THE GUARANTEE", "label"),
                t("Ninety days, full refund, export included.", "h2"),
                t(
                    "If Northwind isn't answering questions your old stack couldn't, we refund the quarter and help you leave cleanly.",
                    "body",
                ),
            ),
        ),
        section(
            "cta",
            group(
                t("Start free. Grow when you're ready.", "h2"),
                button("Create your workspace", "https://app.northwind.dev/signup", { size: "lg" }),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
        section(
            "gallery",
            group(
                t("TEAMS ON NORTHWIND", "label"),
                row(
                    group(
                        img(pic(438), 1.4),
                        t("Cedarworks · 40 viewers, 6 editors, $49", "caption"),
                    ),
                    group(
                        img(pic(439), 1.4),
                        t("A solo founder's Monday report, free plan", "caption"),
                    ),
                    group(img(pic(440), 1.4), t("Haloway's exec review, Business plan", "caption")),
                ),
            ),
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Northwind", "h3")),
                        fitW(t("Analytics for teams without a data team.", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("KEEP READING", "label")),
                        fitW(
                            linked(
                                "caption",
                                ["The comparison", "https://northwind.dev/compare"],
                                " · ",
                                ["Docs", "https://docs.northwind.dev"],
                            ),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("QUESTIONS", "label")),
                        fitW(
                            linked("caption", [
                                "hello@northwind.dev",
                                "mailto:hello@northwind.dev",
                            ]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(441, 1700, 1100), 0.3),
);

// client work: winning it, starting it, and keeping the client in the loop

export const kickoffDeck: ArtifactContent = deck(
    "chalk",
    [
        section(
            "cover",
            group(
                t("ANVIL & OAK × WEXFORD OUTDOOR CO.", "label"),
                t("Kickoff: twelve weeks to a faster store.", "h1"),
                t(
                    "The SOW is signed and the clock starts Monday. This hour covers who's who, how we work, what happens first, and how we keep this the calmest project either of us runs this year.",
                    "subtitle",
                ),
                t("Kickoff call · July 8 · 60 minutes", "caption"),
            ),
            { background: bgImage(pic(442, 1700, 1100), 0.6) },
        ),
        section(
            "agenda",
            group(
                t("01 · THIS HOUR", "label"),
                table(
                    "Minutes,Topic\n0 to 10,Introductions · who decides what\n10 to 25,The plan · twelve weeks in five phases\n25 to 40,Ways of working · demos · sign-offs\n40 to 55,Week one · what we need from you\n55 to 60,Questions & the first decision",
                ),
            ),
        ),
        section(
            "team",
            group(
                t("02 · WHO'S WHO", "label"),
                row(
                    group(
                        t("Dana Okonkwo", "h3"),
                        t("Anvil & Oak · engagement lead · your first call", "caption"),
                    ),
                    group(
                        t("Marcus Vey", "h3"),
                        t("Anvil & Oak · tech lead · owns the architecture", "caption"),
                    ),
                    group(
                        t("Tom Bryce", "h3"),
                        t("Wexford · product owner · owns every decision", "caption"),
                    ),
                ),
                t(
                    "One decision-maker per side. Everyone else advises, loudly and welcome.",
                    "caption",
                ),
            ),
        ),
        section(
            "working",
            split(
                60,
                group(
                    t("03 · HOW WE WORK", "label"),
                    t("Demos on Friday, decisions by Tuesday.", "h2"),
                    bullets(
                        "One-week iterations, each ending in something you can click",
                        "Friday demo, written sign-off request, Tuesday deadline",
                        "A silent Tuesday counts as approval, and we say so out loud now",
                        "One shared Slack channel; email is for contracts only",
                    ),
                ),
                img(pic(443), 0.82),
            ),
        ),
        section(
            "first",
            group(
                t("04 · WEEK ONE", "label"),
                t("What we need before Friday.", "h2"),
                checks(
                    "Shopify Plus admin access · read-only is fine to start",
                    "The clean product export from operations",
                    "Brand assets · fonts, logos, and the photography drive",
                    "45 minutes with whoever answers returns email today",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "risks",
            group(
                t("05 · WHAT USUALLY GOES WRONG", "label"),
                t("We've done this replatform eleven times.", "h2"),
                bullets(
                    "Content migration surprises: we run it twice, weeks 4 and 9",
                    "Peak-season freeze: nothing ships to production in your top sales week",
                    "Scope wobble: new ideas go to the backlog we review together in week 6",
                ),
            ),
        ),
        section(
            "plan",
            split(
                60,
                group(
                    t("06 · THE TWELVE WEEKS", "label"),
                    t("Five phases, no surprises.", "h2"),
                    bullets(
                        "Weeks 1 to 2: discovery · the audit and the honest findings",
                        "Weeks 2 to 4: design system · closed by week four, on purpose",
                        "Weeks 4 to 9: build · demo every Friday without exception",
                        "Weeks 10 to 12: QA, UAT, and a calm launch",
                    ),
                ),
                img(pic(444), 0.82),
            ),
        ),
        section(
            "tools",
            group(
                t("07 · WHERE THINGS LIVE", "label"),
                table(
                    "Thing,Where,Who can see it\nThe build,staging.wexfordoutdoor.com,Everyone on the project\nStatus & decisions,The project hub · one page,Everyone · updated Fridays\nFiles & assets,The shared drive,Both teams\nThe contract,Signed SOW · linked from the hub,Leads",
                ),
            ),
        ),
        section(
            "history",
            group(
                t("08 · WHY US, ONE MORE TIME", "label"),
                quote(
                    "Eleven replatforms, zero missed launch dates, and the calmest Slack channel we've ever had with an agency.",
                    "Product lead · the reference you called",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "close",
            group(
                t("See you Friday at the first demo.", "h2"),
                t("It will be small, and it will be real.", "subtitle"),
            ),
            { background: bgImage(pic(445, 1700, 1100), 0.6) },
        ),
    ],
    bgImage(pic(446, 1700, 1100), 0.28),
);

export const capabilitiesDeck: ArtifactContent = deck(
    "couture",
    [
        section(
            "cover",
            group(
                t("STUDIO HALVORSEN · CAPABILITIES", "label"),
                t("Light, made deliberate.", "h1"),
                t(
                    "An independent design studio for interiors, identities, and the objects in between. Sixteen years, three continents, one obsession with proportion.",
                    "subtitle",
                ),
                t("Prepared for prospective clients · 2026", "caption"),
            ),
            { background: bgImage(pic(447, 1700, 1100), 0.55) },
        ),
        section(
            "statement",
            split(
                40,
                img(pic(448), 1.05),
                group(
                    t("THE STUDIO", "label"),
                    t("We design the pause before the room speaks.", "h2"),
                    t(
                        "Founded in Oslo, Studio Halvorsen makes spaces and identities that hold their composure. We start with restraint, remove until only what matters is left, and then make that one thing unforgettable.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "practices",
            group(
                t("THREE PRACTICES", "label"),
                row(
                    group(
                        img(pic(449), 1.4),
                        t("Interiors", "h3"),
                        t(
                            "Residential and hospitality, from first sketch to last switch plate.",
                            "caption",
                        ),
                    ),
                    group(
                        img(pic(450), 1.4),
                        t("Identity", "h3"),
                        t("Naming, type, and the small printed things people keep.", "caption"),
                    ),
                    group(
                        img(pic(451), 1.4),
                        t("Objects", "h3"),
                        t("Limited-run furniture and lighting, made in-house.", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "work",
            group(
                t("SELECTED WORK", "label"),
                row(
                    group(img(pic(452), 1.4), t("The Glasshouse · Oslo", "caption")),
                    group(img(pic(453), 1.4), t("Linen Apartment · Paris", "caption")),
                    group(img(pic(454), 1.4), t("Hotel Amber · Copenhagen", "caption")),
                ),
            ),
        ),
        section(
            "numbers",
            row(
                stat("120+", "projects completed"),
                stat("16", "years independent"),
                stat("9", "design awards"),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "process",
            group(
                t("HOW AN ENGAGEMENT RUNS", "label"),
                t("Slowly at first, then all at once.", "h2"),
                bullets(
                    "Weeks 1 to 3: we listen, measure, and say very little",
                    "Weeks 4 to 8: one direction, argued properly, then chosen",
                    "Weeks 9 onward: built, supervised, and photographed in the right light",
                ),
            ),
        ),
        section(
            "craft",
            group(
                t("THE CRAFT", "label"),
                t("Materials we keep coming back to.", "h2"),
                row(
                    group(img(pic(455), 1.4), t("Stone, honest about its weight", "caption")),
                    group(img(pic(456), 1.4), t("Wood, old enough to have opinions", "caption")),
                    group(img(pic(457), 1.4), t("Light, the only free material", "caption")),
                ),
            ),
        ),
        section(
            "voices",
            group(
                t("CLIENTS SAY", "label"),
                quote(
                    "They handed us a building we'd stopped seeing and gave it back as somewhere we never want to leave.",
                    "Ines Lund · Owner, Hotel Amber",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "engage",
            group(
                t("ENGAGEMENTS AT A GLANCE", "label"),
                table(
                    "Practice,Timeline,From\nInteriors,4 to 9 months,60K\nIdentity,8 to 12 weeks,24K\nObjects,Seasonal editions,By edition",
                ),
                t("Full scope and fees follow the first conversation, not precede it.", "caption"),
            ),
        ),
        section(
            "contact",
            group(
                t("Tell us about the space.", "h2"),
                t("We take a handful of projects a year so each one gets all of us.", "subtitle"),
                linked("caption", ["studio@halvorsen.no", "mailto:studio@halvorsen.no"], " · ", [
                    "+47 22 40 18 06",
                    "tel:+4722401806",
                ]),
            ),
            { background: bgImage(pic(458, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(459, 1700, 1100), 0.3),
);

export const workshopDeck: ArtifactContent = deck(
    "studio",
    [
        section(
            "cover",
            group(
                t("FOLDWORK · DISCOVERY WORKSHOP", "label"),
                t("One day to agree what we're making.", "h1"),
                t(
                    "Before we design anything, we spend a day in a room with the people who know the truth. This is the plan for that day, and what you'll walk out holding.",
                    "subtitle",
                ),
                t("Atlas Coffee · The roastery loft · July 15, 9 to 4", "caption"),
            ),
            { background: bgImage(pic(460, 1700, 1100), 0.55) },
        ),
        section(
            "why",
            split(
                60,
                group(
                    t("01 · WHY A WORKSHOP", "label"),
                    t("Briefs lie; rooms don't.", "h2"),
                    t(
                        "Written briefs average everyone's opinion into no one's. A day together surfaces the disagreements early, while they're cheap, and gets every decision-maker looking at the same wall by lunchtime.",
                        "body",
                    ),
                ),
                img(pic(461), 0.82),
            ),
        ),
        section(
            "day",
            group(
                t("02 · THE DAY", "label"),
                table(
                    "Time,Block,What happens\n9:00,Where we are,Everyone's honest read · ten minutes each\n10:30,Who it's for,Two customers on the phone · live\n12:30,Lunch,From the roastery bar · obviously\n13:15,What matters,Forced ranking · the argument we came for\n15:00,What's next,Decisions signed on the wall",
                ),
            ),
        ),
        section(
            "exercises",
            group(
                t("03 · THE EXERCISES", "label"),
                row(
                    group(
                        img(pic(462), 1.4),
                        t("Twenty questions", "h3"),
                        t("Fast, written, anonymous; the quiet people win this one.", "caption"),
                    ),
                    group(
                        img(pic(463), 1.4),
                        t("The shelf test", "h3"),
                        t(
                            "Your bag against six rivals, at arm's length, three seconds.",
                            "caption",
                        ),
                    ),
                    group(
                        img(pic(464), 1.4),
                        t("Kill the darling", "h3"),
                        t("Everyone sacrifices one beloved idea, publicly, kindly.", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "outputs",
            group(
                t("04 · WHAT YOU WALK OUT WITH", "label"),
                checks(
                    "One sentence everyone signed, literally",
                    "Three priorities, ranked, with the losing ideas honored in the notes",
                    "The photo of the wall, which becomes page one of the brief",
                    "A decision log with names attached",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "logistics",
            group(
                t("05 · LOGISTICS", "label"),
                bullets(
                    "Six to nine people; above nine the honest ones go quiet",
                    "Phones in the basket; there is a real emergency number on the door",
                    "We facilitate, you decide; the wall belongs to Atlas",
                ),
            ),
        ),
        section(
            "roles",
            split(
                60,
                group(
                    t("06 · WHO'S IN THE ROOM", "label"),
                    t("Six voices, one wall.", "h2"),
                    bullets(
                        "Atlas: both founders, the head roaster, and the wholesale lead",
                        "Foldwork: Nora facilitating, Devin on the wall, Lina documenting",
                        "One empty chair for the customer, kept honest by the morning's calls",
                    ),
                ),
                img(pic(465), 0.82),
            ),
        ),
        section(
            "after",
            group(
                t("07 · WHAT HAPPENS AFTER", "label"),
                table(
                    "When,What you get\nDay + 2,The wall · transcribed and organized\nDay + 5,The brief · one page · signed sentence on top\nWeek 2,Strategy work begins against it\nWeek 8,You point at the wall photo and say 'that's it'",
                ),
            ),
        ),
        section(
            "why2",
            group(
                quote(
                    "The workshop cost us a day and saved us the month of polite disagreement we didn't know we were scheduled for.",
                    "Previous client · said during the week-8 reveal",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "close",
            group(
                t("Bring opinions. Wear comfortable shoes.", "h2"),
                t("Coffee is handled. It's the one thing we're not worried about.", "subtitle"),
            ),
            { background: bgImage(pic(466, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(467, 1700, 1100), 0.3),
);

export const clientStatus: ArtifactContent = doc(
    "chalk",
    [
        section(
            "head",
            group(
                t("ANVIL & OAK × WEXFORD · WEEKLY STATUS", "label"),
                t("Week 6 of 12: on track, one flag", "h1"),
                t(
                    "The storefront is ahead of plan, the returns portal is on it, and content migration raised its hand early, which is exactly when we want flags raised.",
                    "subtitle",
                ),
                t("Sent Friday, August 14 · Next demo: Friday 10am", "caption"),
            ),
            { background: bgImage(pic(468, 1700, 1100), 0.62) },
        ),
        section(
            "status",
            group(
                t("BY WORKSTREAM", "label"),
                table(
                    "Workstream,Status,This week\nStorefront build,Ahead,Product & collection pages done · reviews live\nReturns portal,On track,Label generation working · policy engine in test\nContent migration,Flag,See below · decision needed Tuesday\nAnalytics & CI/CD,On track,Staging pipeline green since Monday",
                    true,
                    1,
                ),
            ),
        ),
        section(
            "shipped",
            group(
                t("SHIPPED THIS WEEK", "label"),
                bullets(
                    "Cart and checkout flows, tested against your live tax rules",
                    "Search with typo tolerance, which your catalog genuinely needs",
                    "The 18th and final page template · design system is now closed",
                ),
            ),
        ),
        section(
            "flag",
            group(
                t("THE FLAG", "label"),
                t("Migration found 240 products with hand-edited HTML.", "h3"),
                t(
                    "The old theme let editors paste raw HTML, and a tenth of the catalog did. We can migrate them as-is (ugly but faithful), strip to clean text (fast but loses formatting), or hand-fix the 60 best sellers and strip the rest. We recommend the third: two days, most of the value. Your call by Tuesday keeps week 9's second migration run on schedule.",
                    "body",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "numbers",
            row(
                stat("52%", "of budget used at week 6 of 12"),
                stat("0", "open blockers on your side"),
                stat("9 days", "to the mid-project review"),
            ),
        ),
        section(
            "demo",
            split(
                40,
                img(pic(469), 1.05),
                group(
                    t("FROM FRIDAY'S DEMO", "label"),
                    t("Checkout, end to end, on your live tax rules.", "h2"),
                    t(
                        "The recording is in the hub. Watch the express-lane moment at 4:12; it's the reason mobile conversion is up in staging tests.",
                        "body",
                    ),
                    linked("caption", "Demo recording: ", [
                        "hub · demos · week 6",
                        "https://anvilandoak.studio/wexford/demos",
                    ]),
                ),
            ),
        ),
        section(
            "risks",
            group(
                t("RISKS WE'RE WATCHING", "label"),
                table(
                    "Risk,State,The move\nPeak-season freeze window,On calendar,Nothing ships to prod in your top sales week\nPhoto assets for 40 new SKUs,Yellow,Your shoot is booked for Tuesday\nThird-party review API rate limits,Watching,Cache layer ready if it bites",
                ),
            ),
        ),
        section(
            "decisions",
            group(
                t("DECISIONS TAKEN THIS WEEK", "label"),
                bullets(
                    "Search synonyms list approved by Tom · live in staging",
                    "Gift wrap ships as post-launch fast-follow · agreed Wednesday",
                    "The 404 page gets the topo-map treatment · nobody could resist",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "gallery",
            group(
                t("FROM STAGING, FRIDAY MORNING", "label"),
                row(
                    group(img(pic(470), 1.4), t("The product page, gear laid flat", "caption")),
                    group(img(pic(471), 1.4), t("Returns portal, label in one tap", "caption")),
                    group(
                        img(pic(472), 1.4),
                        t("The punch list, shrinking on schedule", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "next",
            group(
                t("NEXT WEEK", "label"),
                bullets(
                    "Returns portal end-to-end demo, with a real (sacrificial) order",
                    "Migration decision applied and re-run started",
                    "Performance pass one: the sub-1.5s target gets its first real test",
                ),
                linked("caption", "Questions before Friday: ", [
                    "dana@anvilandoak.studio",
                    "mailto:dana@anvilandoak.studio",
                ]),
            ),
        ),
    ],
    bgImage(pic(473, 1700, 1100), 0.26),
);

export const proposalSite: ArtifactContent = web(
    "gazette",
    [
        section(
            "hero",
            group(
                siteNav(
                    "FOLDWORK",
                    navLink("The plan", "#plan"),
                    navLink("Team", "#team"),
                    navLink("Investment", "#investment"),
                    navCta("Accept & book kickoff", "#accept"),
                ),
                t("A PROPOSAL FOR ATLAS COFFEE", "label"),
                t("A rebrand worth waking up for.", "h1"),
                t(
                    "Atlas makes the best coffee in the valley and looks like the third best. Here is our plan to close that gap in eight weeks, shared as a page so it's easy to pass around, argue with, and say yes to.",
                    "subtitle",
                ),
                t("Valid 30 days · Prepared June 2026 · Nora, Devin & Lina", "caption"),
            ),
            {
                bleed: true,
                background: bgImage(pic(474, 1700, 1100), 0.58),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "read",
            group(
                t("WHAT WE HEARD", "label"),
                t("Great coffee, hiding behind a tired bag.", "h2"),
                t(
                    "Your wholesale doubled in two years; your shelf presence didn't. Three roasters in the valley now look more considered than the one that taught them the craft. The product needs no work. The story wrapped around it does.",
                    "body",
                ),
            ),
        ),
        section(
            "plan",
            group(
                t("THE PLAN", "label"),
                t("Eight weeks, three moves.", "h2"),
                row(
                    group(
                        img(pic(475), 1.4),
                        t("Weeks 1–3 · Strategy", "h3"),
                        t(
                            "Positioning, naming audit, and the one sentence everything hangs on.",
                            "caption",
                        ),
                    ),
                    group(
                        img(pic(476), 1.4),
                        t("Weeks 3–6 · Identity", "h3"),
                        t(
                            "Mark, type, color, and packaging, tested at arm's length on a real shelf.",
                            "caption",
                        ),
                    ),
                    group(
                        img(pic(477), 1.4),
                        t("Weeks 6–8 · Rollout", "h3"),
                        t(
                            "Bags, menus, site, and the guidelines that keep it all standing.",
                            "caption",
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "team",
            group(
                t("WHO SHOWS UP", "label"),
                row(
                    group(
                        img(pic(478), 1),
                        t("Nora Espen", "h3"),
                        t("Creative director · every review, no exceptions", "caption"),
                    ),
                    group(
                        img(pic(479), 1),
                        t("Devin Marsh", "h3"),
                        t("Brand strategist · the words and the why", "caption"),
                    ),
                    group(
                        img(pic(480), 1),
                        t("Lina Vogel", "h3"),
                        t("Design & web lead · from sketch to shipped", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "investment",
            group(
                t("THE INVESTMENT", "label"),
                table(
                    "Phase,Weeks,Fee\nStrategy & positioning,1 to 3,$14K\nIdentity & packaging,3 to 6,$26K\nRollout & guidelines,6 to 8,$12K\nTotal · fixed,Eight weeks,$52K",
                ),
                t(
                    "Fixed fee, no surprises: changes to scope get a written note before they get a dollar.",
                    "caption",
                ),
            ),
        ),
        section(
            "work",
            group(
                t("WORK LIKE YOURS", "label"),
                row(
                    group(
                        img(pic(481), 1.4),
                        t("Novel Press", "h3"),
                        t("Publisher rebrand · shelf sales up 22% in year one", "caption"),
                    ),
                    group(
                        img(pic(482), 1.4),
                        t("Orchard Grocery", "h3"),
                        t("Identity and packaging · from farmers market to 40 doors", "caption"),
                    ),
                    group(
                        img(pic(483), 1.4),
                        t("Tidal", "h3"),
                        t("Clean-energy launch · the campaign your barista mentioned", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "process",
            group(
                t("HOW WEEKS FEEL", "label"),
                dish(
                    "Mondays",
                    "the working session",
                    "Ninety minutes, decisions on the wall, coffee handled by you, obviously",
                ),
                dish(
                    "Thursdays",
                    "work in progress",
                    "Real artifacts in your inbox, never a status theater deck",
                ),
                dish(
                    "Always",
                    "one channel",
                    "Slack for speed, email for contracts, nothing lost in either",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "proof",
            group(
                testimonial(
                    "Eight weeks, zero drama, and a brand our own team started defending in meetings. Worth every euro.",
                    "Rui Almeida",
                    "Founder, Novel Press",
                    "https://i.pravatar.cc/240?img=59",
                ),
            ),
        ),
        section(
            "accept",
            group(
                t("If this resonates, the kickoff is one click away.", "h2"),
                t(
                    "We hold a start date for 30 days. The coffee for the workshop is, of course, yours.",
                    "subtitle",
                ),
                button("Accept & schedule kickoff", "mailto:nora@foldwork.studio", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(484, 1700, 1100), 0.58) },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(col(fitW(t("Foldwork", "h3")), fitW(t("Brand studio · Lisbon", "caption")))),
                fitW(
                    col(
                        fitW(t("THIS PROPOSAL", "label")),
                        fitW(t("Valid 30 days · fixed fee · start date held", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("TALK TO NORA", "label")),
                        fitW(
                            linked("caption", [
                                "nora@foldwork.studio",
                                "mailto:nora@foldwork.studio",
                            ]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(485, 1700, 1100), 0.3),
);

export const projectHub: ArtifactContent = web(
    "chalk",
    [
        section(
            "hero",
            group(
                siteNav(
                    "ANVIL & OAK",
                    navLink("Status", "#now"),
                    navLink("Timeline", "#timeline"),
                    navLink("Decisions", "#decisions"),
                    navCta("Book the Friday demo", "mailto:dana@anvilandoak.studio"),
                ),
                t("WEXFORD REPLATFORM · PROJECT HUB", "label"),
                t("Everything about the build, on one page.", "h1"),
                t(
                    "Bookmark this. Status every Friday, the timeline as it actually stands, every decision with a date on it, and the one place to raise anything.",
                    "subtitle",
                ),
                t("Updated Fridays by 4pm · Last update: August 14", "caption"),
            ),
            {
                bleed: true,
                background: bgImage(pic(486, 1700, 1100), 0.6),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "now",
            group(
                t("WHERE WE ARE", "label"),
                t("Week 6 of 12: green, with one flag.", "h2"),
                row(
                    stat("52%", "budget used, on plan"),
                    stat("18 / 18", "page templates done"),
                    stat("1", "decision waiting on Wexford"),
                ),
            ),
        ),
        section(
            "timeline",
            group(
                t("THE TWELVE WEEKS", "label"),
                table(
                    "Phase,Weeks,State\nDiscovery,1 to 2,Done\nDesign system,2 to 4,Done\nBuild,4 to 9,In progress · ahead\nQA & UAT,10 to 11,Ahead of us\nLaunch,12,September 29 · unchanged",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "decisions",
            group(
                t("DECISION LOG", "label"),
                table(
                    "Date,Decision,Who\nJul 12,Headless storefront on Next.js,Tom · recommended by Marcus\nJul 26,Returns portal ships at launch · not phase 2,Tom\nAug 9,Reviews platform: keep Yotpo,Tom\nOpen,Hand-edited product HTML · fix 60 & strip rest?,Due Tuesday",
                ),
            ),
        ),
        section(
            "links",
            group(
                t("THE USUAL DOORS", "label"),
                linked(
                    "body",
                    ["Staging site", "https://staging.wexfordoutdoor.com"],
                    " · ",
                    ["Friday demo recordings", "https://anvilandoak.studio/wexford/demos"],
                    " · ",
                    ["The signed SOW", "https://anvilandoak.studio/wexford/sow"],
                ),
                t(
                    "Access issues? Slack #wexford-build and someone fixes it inside the hour.",
                    "caption",
                ),
            ),
        ),
        section(
            "shipped",
            group(
                t("SHIPPED LAST WEEK", "label"),
                bullets(
                    "Cart and checkout flows against live tax rules",
                    "Search with typo tolerance across all 4,100 SKUs",
                    "The final page template · the design system is closed",
                ),
            ),
        ),
        section(
            "gallery",
            group(
                t("FROM STAGING, THIS MORNING", "label"),
                row(
                    group(img(pic(487), 1.4), t("The new product page, gear laid flat", "caption")),
                    group(
                        img(pic(488), 1.4),
                        t("Checkout on desktop, three steps flat", "caption"),
                    ),
                    group(img(pic(489), 1.4), t("The returns portal, label in one tap", "caption")),
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "cadence",
            group(
                t("THE WEEKLY RHYTHM", "label"),
                dish(
                    "Friday 10am",
                    "the demo",
                    "Thirty minutes · recorded · sign-off request follows by noon",
                ),
                dish(
                    "Tuesday noon",
                    "decision deadline",
                    "Silence counts as approval; we put that in writing on purpose",
                ),
                dish(
                    "Friday 4pm",
                    "this page updates",
                    "Status, budget, and the flag of the week, if any",
                ),
            ),
        ),
        section(
            "raise",
            group(
                t("See something? Say something small, early.", "h2"),
                t(
                    "The cheap time to change course is always this week, never week eleven.",
                    "subtitle",
                ),
                button("Raise it in Slack", "https://wexford.slack.com/channels/wexford-build", {
                    size: "lg",
                }),
            ),
            { bleed: true, background: bgImage(pic(490, 1700, 1100), 0.6) },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Anvil & Oak", "h3")),
                        fitW(t("Commerce engineering studio.", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("THE PROJECT", "label")),
                        fitW(t("Wexford replatform · week 6 of 12", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("RAISE ANYTHING", "label")),
                        fitW(
                            linked("caption", [
                                "dana@anvilandoak.studio",
                                "mailto:dana@anvilandoak.studio",
                            ]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(491, 1700, 1100), 0.26),
);

export const caseStudySite: ArtifactContent = web(
    "gazette",
    [
        section(
            "hero",
            group(
                siteNav(
                    "TEMPO",
                    navLink("The story", "#story"),
                    navLink("Results", "#results"),
                    navCta("Book a demo", "https://tempo.works/demo"),
                ),
                t("CUSTOMER STORY · MARLOW HOSPITALITY GROUP", "label"),
                t("Scaling hospitality without scaling the chaos.", "h1"),
                t(
                    "How a 22-restaurant group cut labor costs 18% and opened six new locations in a year, with one platform running the floor behind the scenes.",
                    "subtitle",
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(492, 1700, 1100), 0.62),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "story",
            split(
                60,
                group(
                    t("THE STORY", "label"),
                    t("Growth was outrunning the spreadsheet.", "h2"),
                    t(
                        "Every general manager built next week's schedule by hand on Sunday night. Forecasts were a guess, overtime was a surprise, and a sick line cook in Boston could not be covered by an off-shift cook two blocks away. With six new locations on the calendar, doing nothing was the most expensive option on the table.",
                        "body",
                    ),
                ),
                img(pic(493), 0.82),
            ),
        ),
        section(
            "results",
            row(
                stat("−18%", "labor cost as a share of sales"),
                stat("$2.4M", "annualized savings across the group"),
                stat("9 days", "to fully staff a new opening"),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
        section(
            "how",
            group(
                t("HOW IT LANDED", "label"),
                t("Pilot one city, then earn the rest.", "h2"),
                t(
                    "Tempo started where the pain was sharpest: the four Boston restaurants. Scheduling was rebuilt around demand forecasts drawn from three years of POS data; results were let to speak, then the other 18 locations asked for it themselves.",
                    "body",
                ),
                bullets(
                    "Sales-driven forecasts auto-build the first draft of every schedule",
                    "A shared shift marketplace lets staff cover across all 22 locations",
                    "Live labor-versus-target alerts catch overtime before it happens",
                ),
            ),
        ),
        section(
            "quote",
            group(
                testimonial(
                    "I got my Sundays back, and my GMs got their floors back. Tempo didn't just save us money. It let us open six restaurants without losing the thing that makes Marlow, Marlow.",
                    "Daniela Marlow",
                    "COO, Marlow Hospitality Group",
                    "https://i.pravatar.cc/240?img=44",
                ),
            ),
            { bleed: true, background: bgImage(pic(494, 1700, 1100), 0.6) },
        ),
        section(
            "detail",
            group(
                t("WHERE THE SAVINGS CAME FROM", "label"),
                table(
                    "Line,Before,After\nOvertime hours / week,410,140\nManager hours on schedules,6 per week each,45 minutes\nOpen-shift coverage time,2 days,4 hours\nNew-location staffing,6 weeks,9 days",
                ),
            ),
        ),
        section(
            "rollout",
            split(
                40,
                img(pic(495), 1.05),
                group(
                    t("THE ROLLOUT, HONESTLY", "label"),
                    t("Week three was the hard one.", "h2"),
                    t(
                        "Two GMs kept shadow spreadsheets until the forecasts beat them publicly, three weeks running. Marlow's COO let the numbers argue instead of the memo, which is why the other eighteen locations asked instead of resisted.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "gallery",
            group(
                t("THE FLOORS IN QUESTION", "label"),
                row(
                    group(img(pic(496), 1.4), t("Marlow Beacon Hill, the pilot room", "caption")),
                    group(img(pic(497), 1.4), t("The patio at Marlow Cambridge", "caption")),
                    group(img(pic(498), 1.4), t("Service, mid-Saturday, unbothered", "caption")),
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "cta",
            group(
                t("See what your floors look like on Tempo.", "h2"),
                t(
                    "A 30-minute walkthrough could find your labor line's missing points.",
                    "subtitle",
                ),
                button("Book a demo", "https://tempo.works/demo", { size: "lg" }),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Tempo", "h3")),
                        fitW(t("Workforce platform for hospitality.", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("MORE STORIES", "label")),
                        fitW(
                            linked("caption", [
                                "tempo.works/customers",
                                "https://tempo.works/customers",
                            ]),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("SEE IT LIVE", "label")),
                        fitW(linked("caption", ["Book a demo", "https://tempo.works/demo"])),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(499, 1700, 1100), 0.3),
);

export const servicesPage: ArtifactContent = web(
    "couture",
    [
        section(
            "hero",
            group(
                siteNav(
                    "STUDIO HALVORSEN",
                    navLink("Services", "#services"),
                    navLink("Process", "#process"),
                    navLink("FAQ", "#faq"),
                    navCta("Enquire", "#enquire"),
                ),
                t("SERVICES & ENGAGEMENTS", "label"),
                t("Three ways to work with us.", "h1"),
                t(
                    "Interiors, identity, and objects, taken on a few at a time. What each engagement includes, how long it runs, and where the fees start.",
                    "subtitle",
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(500, 1700, 1100), 0.5),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "services",
            row(
                { align: "start" },
                pricing(
                    "INTERIORS",
                    "from 60K",
                    "Residential & hospitality · 4 to 9 months",
                    [
                        "Full architecture of the interior",
                        "Every material, fixture & maker",
                        "Site supervision to handover",
                        "The photography, in the right light",
                    ],
                    button("Enquire", "#enquire"),
                ),
                pricing(
                    "IDENTITY",
                    "from 24K",
                    "Places & makers · 8 to 12 weeks",
                    [
                        "Naming and voice",
                        "Mark, type & color",
                        "The printed things people keep",
                        "Guidelines that survive you",
                    ],
                    button("Enquire", "#enquire", { variant: "outline" }),
                ),
                pricing(
                    "OBJECTS",
                    "by edition",
                    "Furniture & lighting · seasonal",
                    [
                        "Limited runs, numbered",
                        "Made in-house in Oslo",
                        "Trade enquiries welcome",
                        "Waitlist opens each spring",
                    ],
                    button("Join the waitlist", "#enquire", { variant: "outline" }),
                ),
            ),
        ),
        section(
            "process",
            group(
                t("HOW IT RUNS", "label"),
                t("We say no to most things, slowly and kindly.", "h2"),
                t(
                    "Every engagement begins with a conversation and a site visit, unhurried. If the fit is right, you get one direction, argued properly, rather than three diluted ones. Sixteen years in, this is still the part clients thank us for.",
                    "body",
                ),
            ),
            { bleed: true, background: bgImage(pic(501, 1700, 1100), 0.55) },
        ),
        section(
            "faq",
            group(
                t("ASKED OFTEN", "label"),
                faq(
                    "collapsible",
                    [
                        [
                            "Do you take projects outside Norway?",
                            "Yes; a third of our work is abroad. Travel is billed plainly, at cost, and we batch visits so you never pay for a commute twice.",
                        ],
                        [
                            "Can we start with something small?",
                            "The identity practice is the usual door in. Several interior clients began with a menu and a logotype.",
                        ],
                        [
                            "Why is there no portfolio PDF?",
                            "The portfolio lives at halvorsen.no and stays current. What we send instead is three references who will take your call.",
                        ],
                    ],
                    true,
                ),
            ),
        ),
        section(
            "recent",
            group(
                t("RECENTLY FINISHED", "label"),
                row(
                    group(
                        img(pic(502), 1.4),
                        t("Fjord House · private residence, Bergen", "caption"),
                    ),
                    group(img(pic(503), 1.4), t("Hotel Amber · 28 rooms, Copenhagen", "caption")),
                    group(
                        img(pic(504), 1.4),
                        t("Marlowe Flagship · retail identity, London", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "voice",
            group(
                testimonial(
                    "Every studio says no to things. Halvorsen says no to the right things, and what survives is exactly the project you should have asked for.",
                    "Sofia Marques",
                    "Client, twice",
                    "https://i.pravatar.cc/240?img=44",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "numbers",
            row(
                stat("6", "projects taken per year"),
                stat("16", "years independent"),
                stat("2", "continents shipped to this year"),
            ),
        ),
        section(
            "enquire",
            group(
                t("Tell us about the space.", "h2"),
                t(
                    "A room, a brand, or an idea that deserves restraint. We reply within two days.",
                    "subtitle",
                ),
                button("Write to the studio", "mailto:studio@halvorsen.no", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(505, 1700, 1100), 0.55) },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Studio Halvorsen", "h3")),
                        fitW(t("Thorvald Meyers gate 12, Oslo", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("STUDIO", "label")),
                        fitW(
                            linked(
                                "caption",
                                ["studio@halvorsen.no", "mailto:studio@halvorsen.no"],
                                " · ",
                                ["+47 22 40 18 06", "tel:+4722401806"],
                            ),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("ELSEWHERE", "label")),
                        fitW(
                            linked(
                                "caption",
                                ["Instagram", "https://www.instagram.com/studiohalvorsen"],
                                " · ",
                                ["The portfolio", "https://halvorsen.no"],
                            ),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(506, 1700, 1100), 0.3),
);

// reports & reviews: the cadence decks and the public-facing report sites

export const allHandsDeck: ArtifactContent = deck(
    "kiln",
    [
        section(
            "cover",
            group(
                t("TIDELINE · ALL-HANDS · SEPTEMBER", "label"),
                t("Sixty people, one scoreboard.", "h1"),
                t(
                    "The monthly all-hands: the numbers as they are, what shipped, what hurt, and where we point the next thirty days.",
                    "subtitle",
                ),
                t("First Thursday · 45 minutes · questions always win", "caption"),
            ),
            { background: bgImage(pic(507, 1700, 1100), 0.6) },
        ),
        section(
            "numbers",
            group(
                t("01 · THE SCOREBOARD", "label"),
                row(
                    stat("$48.6M", "ARR · +9% QoQ"),
                    stat("119%", "net revenue retention"),
                    stat("612", "customers · 84 new"),
                ),
                t("Same three numbers every month, so trends beat theater.", "caption"),
            ),
        ),
        section(
            "shipped",
            split(
                60,
                group(
                    t("02 · WHAT SHIPPED", "label"),
                    t("Signals went GA, and it's landing.", "h2"),
                    bullets(
                        "38% of active customers adopted within three weeks",
                        "First enterprise deal closed on the back of it",
                        "The migration tool nobody notices, which was the goal",
                    ),
                    pin(badge("All four, on time."), "end", "start", { dy: 6, rotate: -4, z: 2 }),
                ),
                img(pic(508), 0.82),
            ),
        ),
        section(
            "hard",
            group(
                t("03 · THE HARD THING", "label"),
                t("We missed the new-logo number, again.", "h2"),
                t(
                    "84 new logos against 95 forecast, second miss in a row. It is not the market and it is not the product: our SDR ramp is five weeks slower than planned. The fix is in motion (see priorities), and the honest read is that Q4 pipeline starts thinner than we'd like.",
                    "body",
                ),
            ),
            { background: bgTone("contrast") },
        ),
        section(
            "priorities",
            group(
                t("04 · THE NEXT THIRTY DAYS", "label"),
                bullets(
                    "Rebuild pipeline coverage to 4.0× by mid-quarter",
                    "Ship Reverse ETL to GA in week six; two stalled deals are waiting on it",
                    "Every leader spends one hour in support tickets; calendar holds go out Friday",
                ),
            ),
        ),
        section(
            "shoutouts",
            split(
                40,
                img(pic(509), 1.05),
                group(
                    t("05 · SHOUTOUTS", "label"),
                    t("The quarter had heroes.", "h2"),
                    bullets(
                        "Renee's support team: 96 CSAT through the busiest month ever",
                        "The Signals crew, for shipping the boring parts first",
                        "Marco, who deleted 40,000 lines of code and nothing broke",
                    ),
                ),
            ),
        ),
        section(
            "customers",
            split(
                60,
                group(
                    t("06 · CUSTOMER OF THE MONTH", "label"),
                    t("Cobalt Health, from pilot to platform.", "h2"),
                    t(
                        "Two business units became seven this quarter, a $640K upsell that started as one analyst's dashboard. The quote on the next slide is going in the deck for the board too.",
                        "body",
                    ),
                ),
                img(pic(510), 0.82),
            ),
        ),
        section(
            "quote",
            group(
                quote(
                    "Tessera quietly became the system the rest of our stack reports into. We'd feel its absence in a day.",
                    "Director of Data Platform, Cobalt Health",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "people",
            group(
                t("07 · PEOPLE NEWS", "label"),
                bullets(
                    "Nine new faces this month; the wall of intros is in the kitchen",
                    "Parental leave policy extended to 20 weeks, effective immediately",
                    "The Lisbon offsite lands March 9 to 13; flights book next week",
                ),
            ),
        ),
        section(
            "close",
            group(
                t("Questions. The real ones.", "h1"),
                t(
                    "Slido is open, anonymous works too, and we stay until they're done.",
                    "subtitle",
                ),
            ),
            { background: bgImage(pic(511, 1700, 1100), 0.6) },
        ),
    ],
    bgImage(pic(512, 1700, 1100), 0.3),
);

export const growthReview: ArtifactContent = deck(
    "cement",
    [
        section(
            "cover",
            group(
                t("TIDEPOOL · MARKETING · Q3 REVIEW", "label"),
                t("What we spent, what it bought.", "h1"),
                t(
                    "The quarter in acquisition: every channel against its target, the two bets that paid, the one that didn't, and where Q4's budget moves because of it.",
                    "subtitle",
                ),
                t("Growth review · October 3 · numbers as of September 30", "caption"),
            ),
            { background: bgImage(pic(513, 1700, 1100), 0.6) },
        ),
        section(
            "headline",
            group(
                row(
                    { align: "baseline", gap: 10 },
                    fitW(t("1,140", "h1")),
                    t("signups, 114% of the target.", "h2"),
                ),
                row(
                    stat("$96", "blended CAC · target $120"),
                    stat("31%", "signup-to-paid at day 30"),
                ),
            ),
        ),
        section(
            "channels",
            group(
                t("01 · CHANNEL BY CHANNEL", "label"),
                table(
                    "Channel,Spend,Signups,CAC,Verdict\nContent & SEO,$18K,410,$44,Double it\nShopify listing,$0,290,$0,Feature won us\nPaid social,$42K,300,$140,Trim & retest\nPodcast sponsorships,$24K,140,$171,Cut",
                ),
            ),
        ),
        section(
            "worked",
            split(
                60,
                group(
                    t("02 · WHAT WORKED", "label"),
                    t("The unglamorous compounding stuff.", "h2"),
                    bullets(
                        "Operator guides now drive 36% of signups at a $44 CAC",
                        "The Shopify feature outperformed every paid channel at zero cost",
                        "Founder posts beat the brand account 6:1 on the same content",
                    ),
                ),
                img(pic(514), 0.82),
            ),
        ),
        section(
            "didnt",
            group(
                t("03 · WHAT DIDN'T", "label"),
                t("Podcasts sounded right and priced wrong.", "h2"),
                t(
                    "Three shows, $24K, 140 signups, and a day-30 conversion half our average: listeners were founders, our buyer is operators. The creative was good, the audience was wrong, and we're cutting it without regret. The budget moves to the guides engine.",
                    "body",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "next",
            group(
                t("04 · Q4 BETS", "label"),
                bullets(
                    "Guides engine at 2× budget, with a dedicated writer hired by November",
                    "Retest paid social on operator lookalikes only, $15K cap",
                    "First customer-referral program: the ask ships in the product, not email",
                ),
            ),
        ),
        section(
            "cohorts",
            split(
                40,
                img(pic(515), 1.05),
                group(
                    t("05 · COHORT QUALITY", "label"),
                    t("Content signups stay; paid signups shop.", "h2"),
                    t(
                        "Day-90 retention: 71% from guides, 44% from paid social. The channel mix isn't just a cost question; it decides who we're building for next year.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "experiments",
            group(
                t("06 · EXPERIMENT LEDGER", "label"),
                table(
                    "Test,Result,Decision\nPricing page rewrite,+18% trial starts,Shipped\nExit-intent popup,+2% signups · -9 brand dignity,Killed\nFounder podcast tour,Unmeasurable · fun,Retired\nComparison page,+31% organic entrances,Doubling down",
                ),
            ),
        ),
        section(
            "asks",
            group(
                t("07 · WHAT GROWTH NEEDS", "label"),
                bullets(
                    "The content writer req approved before the holidays eat the pipeline",
                    "Engineering: two weeks for the referral mechanic in Q4",
                    "Keep the Shopify relationship warm; that feature was worth $42K of spend",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "close",
            group(
                t("Budget follows evidence.", "h2"),
                t("Same review, same table, first Friday of January.", "subtitle"),
            ),
            { background: bgImage(pic(516, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(517, 1700, 1100), 0.3),
);

export const researchReadout: ArtifactContent = deck(
    "studio",
    [
        section(
            "cover",
            group(
                t("NORTHWIND INSTITUTE · CONFERENCE READOUT", "label"),
                t("Where work lives now.", "h1"),
                t(
                    "Twenty minutes on the four findings that matter from our 4,000-worker study, for people who will not read the ninety pages. The ninety pages exist, and we'll point at them.",
                    "subtitle",
                ),
                t("Future of Work Summit · 18 minutes + questions", "caption"),
            ),
            { background: bgImage(pic(518, 1700, 1100), 0.55) },
        ),
        section(
            "one",
            group(
                t("FINDING 01", "label"),
                t("Hybrid won, and then it calcified.", "h1"),
                t(
                    "54% of knowledge workers are hybrid and the number has not moved in 18 months. The experiment phase is over; what we have now is the settlement.",
                    "subtitle",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "two",
            split(
                60,
                group(
                    t("FINDING 02", "label"),
                    t("The office became a meeting room.", "h2"),
                    t(
                        "In-office days are 71% meetings, up from 43% pre-pandemic. Focus work went home and stayed there. Companies still planning space around desks are building for a workforce that no longer exists.",
                        "body",
                    ),
                ),
                img(pic(519), 0.82),
            ),
        ),
        section(
            "three",
            split(
                40,
                img(pic(520), 1.05),
                group(
                    t("FINDING 03", "label"),
                    t("Mentorship is the casualty nobody budgeted.", "h2"),
                    t(
                        "Workers under 30 report 40% less unplanned contact with seniors than the 2019 cohort, and it shows in ramp times. The firms beating this run deliberate pairing, not more office days.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "four",
            group(
                t("FINDING 04", "label"),
                t("Distributed hiring is now the default, quietly.", "h2"),
                row(
                    stat("68%", "of 2026 postings are location-flexible"),
                    stat("2.4×", "applicant pool vs. office-bound roles"),
                    stat("−12%", "median salary premium for metro roles"),
                ),
            ),
        ),
        section(
            "sowhat",
            group(
                t("WHAT TO DO WITH THIS", "label"),
                bullets(
                    "Plan space for meetings and mentorship, not desks",
                    "Make pairing deliberate; proximity stopped being free",
                    "Write the hybrid contract down; ambiguity taxes your best people",
                ),
            ),
            { background: bgTone("contrast") },
        ),
        section(
            "meth",
            split(
                60,
                group(
                    t("THE METHOD, FOR THE SKEPTICS", "label"),
                    t("4,000 workers, weighted, replicable.", "h2"),
                    t(
                        "Census-weighted on five dimensions, fielded March and April, instruments public. Every crosstab in this talk ships in the appendix, because a finding you can't check is a press release.",
                        "body",
                    ),
                ),
                img(pic(521), 0.82),
            ),
        ),
        section(
            "surprise",
            group(
                t("THE FINDING THAT SURPRISED US", "label"),
                t("Juniors want MORE office, not less.", "h2"),
                t(
                    "Workers under 26 want 3.1 anchored days; their managers assume they want 1.5. The generation gap runs the opposite direction from the discourse, and nobody's floor plan accounts for it.",
                    "body",
                ),
            ),
            { background: bgTone("contrast") },
        ),
        section(
            "quote",
            group(
                quote(
                    "This is the dataset we quote in every workplace decision now.",
                    "Head of Workplace, Bright Coast · study member",
                ),
            ),
        ),
        section(
            "close",
            group(
                t("The ninety pages, if you want them.", "h2"),
                linked("subtitle", "The full report is free at ", [
                    "northwind.institute/work",
                    "https://northwind.institute/work",
                ]),
                t(
                    "Slides and data downloads live there too. Questions now, or at the coffee table.",
                    "caption",
                ),
            ),
            { background: bgImage(pic(522, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(523, 1700, 1100), 0.3),
);

export const annualPlan: ArtifactContent = deck(
    "press",
    [
        section(
            "cover",
            group(
                t("SOLSTICE ENERGY · THE 2027 PLAN", "label"),
                t("The year we make boring beautiful.", "h1"),
                t(
                    "2026 proved the model. 2027 is about doing it a thousand more times, safely, profitably, and without losing the crew culture that got us here.",
                    "subtitle",
                ),
                t("Presented to the whole company · December 12", "caption"),
            ),
            { background: bgImage(pic(524, 1700, 1100), 0.55) },
        ),
        section(
            "recap",
            row(
                stat("2,340", "systems installed in 2026"),
                stat("$41M", "revenue · first profitable year"),
                stat("94", "crew members · zero lost-time incidents"),
            ),
        ),
        section(
            "p1",
            split(
                60,
                group(
                    t("PRIORITY ONE", "label"),
                    t("A thousand more roofs, same safety record.", "h2"),
                    t(
                        "3,400 installs is the number: forty percent growth, no new metros, deeper crews in the ones we own. Every install still starts with the same walkaround and ends with the same sign-off, because the streak matters more than the speed.",
                        "body",
                    ),
                ),
                img(pic(525), 0.82),
            ),
        ),
        section(
            "p2",
            split(
                40,
                img(pic(526), 1.05),
                group(
                    t("PRIORITY TWO", "label"),
                    t("GridShare grows up.", "h2"),
                    t(
                        "The neighborhood-battery network goes from pilot to product: 400 homes sharing storage by December, and the first utility contract that pays our customers for the privilege.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "p3",
            group(
                t("PRIORITY THREE", "label"),
                t("The crew pipeline becomes a school.", "h2"),
                t(
                    "Twelve apprentices in 2026 became eight great installers. In 2027 the academy takes thirty, pays from day one, and graduates people other companies will try to poach and mostly fail to.",
                    "body",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "targets",
            group(
                t("THE TARGETS, ON ONE SLIDE", "label"),
                table(
                    "Metric,2026 actual,2027 target\nInstalls,2340,3400\nRevenue,$41M,$58M\nGridShare homes,60 pilot,400\nApprentices,12,30",
                ),
            ),
        ),
        section(
            "how",
            split(
                60,
                group(
                    t("HOW WE'LL WORK", "label"),
                    t("Same rhythm, bigger crews.", "h2"),
                    bullets(
                        "Quarterly targets on the wall, reviewed the first Friday, no theater",
                        "Every metro keeps a training bay; the academy feeds them",
                        "GridShare gets its own team of six; no more borrowed engineers",
                    ),
                ),
                img(pic(527), 0.82),
            ),
        ),
        section(
            "risks",
            group(
                t("WHAT COULD GO WRONG", "label"),
                table(
                    "Risk,Reading,The hedge\nPanel supply tightens,Medium,Two suppliers locked · Q1 buffer stock\nRate environment slows roofs,Medium,Lease product launches March\nCrew growth dilutes safety culture,Low · watched,Academy ratio capped at 1:3",
                ),
            ),
        ),
        section(
            "north",
            group(
                quote(
                    "Boring is the compliment. Every install that makes no story is a family that just has power now.",
                    "Naomi Okonkwo · CEO · from last year's letter",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "close",
            group(
                t("Boring, beautiful, a thousand times.", "h2"),
                t(
                    "Thank you for a year worth building on. Now let's go do the unglamorous part.",
                    "subtitle",
                ),
            ),
            { background: bgImage(pic(528, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(529, 1700, 1100), 0.3),
);

export const impactSite: ArtifactContent = web(
    "press",
    [
        section(
            "hero",
            group(
                siteNav(
                    "SOLSTICE",
                    navLink("The numbers", "#numbers"),
                    navLink("Stories", "#stories"),
                    navLink("2027", "#goals"),
                    navCta("Download the report", "https://solstice.energy/impact.pdf"),
                ),
                t("IMPACT REPORT · 2026", "label"),
                t("What 2,340 roofs add up to.", "h1"),
                t(
                    "Our first profitable year was also our biggest for the grid, the crews, and the neighborhoods we work in. The whole account, in public, like every year.",
                    "subtitle",
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(530, 1700, 1100), 0.55),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "numbers",
            row(
                stat("31 GWh", "clean energy generated by our fleet"),
                stat("22K tons", "of CO₂ avoided this year"),
                stat("$4.1M", "saved on customer power bills"),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "how",
            split(
                60,
                group(
                    t("HOW WE COUNT", "label"),
                    t("Real meters, third-party checked.", "h2"),
                    t(
                        "Every number on this page comes from production meters, not models, and the methodology is audited by Meridian Climate Verification. Where we estimate, we say so and show the math in the appendix.",
                        "body",
                    ),
                ),
                img(pic(531), 0.82),
            ),
        ),
        section(
            "stories",
            group(
                t("THREE ROOFS AMONG THOUSANDS", "label"),
                row(
                    group(
                        img(pic(532), 1.4),
                        t("The Alvarez family", "h3"),
                        t("$97 average monthly bill became $11, battery included.", "caption"),
                    ),
                    group(
                        img(pic(533), 1.4),
                        t("Casa Verde co-op", "h3"),
                        t("Forty units sharing one GridShare battery wall.", "caption"),
                    ),
                    group(
                        img(pic(534), 1.4),
                        t("Crew 7", "h3"),
                        t("Four apprentices, 212 installs, zero incidents.", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "goals",
            group(
                t("2027, IN WRITING", "label"),
                table(
                    "Goal,Target,We'll report\nInstalls,3400,Quarterly\nGridShare homes,400,Quarterly\nApprentice academy,30 paid seats,Twice a year",
                ),
                t(
                    "Last year's goals hit 2 of 3; the miss and the why are on page 31 of the PDF.",
                    "caption",
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
        section(
            "grid",
            split(
                60,
                group(
                    t("THE GRID EFFECT", "label"),
                    t("Our fleet is a small power plant now.", "h2"),
                    t(
                        "On the August 14 heat event, Solstice homes returned 4.1 MWh to the grid at peak, the output of a mid-size gas peaker, from rooftops that were making their owners money. That afternoon is the company thesis in one data point.",
                        "body",
                    ),
                ),
                img(pic(535), 0.82),
            ),
        ),
        section(
            "people",
            group(
                t("THE CREWS", "label"),
                row(
                    stat("94", "crew members, all W-2"),
                    stat("$31", "median hourly, plus production"),
                    stat("12 → 30", "apprentice seats next year"),
                ),
                t(
                    "Every number audited alongside the energy figures; people are impact too.",
                    "caption",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "quote2",
            group(
                testimonial(
                    "They put panels on our co-op and apprenticed two of our residents in the same summer. That's what neighborhood infrastructure means.",
                    "Rosa Delgado",
                    "Board president, Casa Verde",
                    "https://i.pravatar.cc/240?img=25",
                ),
            ),
        ),
        section(
            "cta",
            group(
                t("The whole report, no email wall.", "h2"),
                button("Download the PDF", "https://solstice.energy/impact.pdf", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(536, 1700, 1100), 0.5) },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Solstice Energy", "h3")),
                        fitW(t("Rooftop solar, done boringly well.", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("THE REPORT", "label")),
                        fitW(
                            linked(
                                "caption",
                                ["Full PDF", "https://solstice.energy/impact.pdf"],
                                " · ",
                                ["Methodology", "https://solstice.energy/impact/method"],
                            ),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("QUESTIONS", "label")),
                        fitW(
                            linked("caption", [
                                "impact@solstice.energy",
                                "mailto:impact@solstice.energy",
                            ]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(537, 1700, 1100), 0.3),
);
export const researchSite: ArtifactContent = web(
    "studio",
    [
        section(
            "hero",
            group(
                siteNav(
                    "NORTHWIND INSTITUTE",
                    navLink("Findings", "#findings"),
                    navLink("Method", "#method"),
                    navCta("Get the report", "#download"),
                ),
                t("THE 2026 STUDY · FREE, NO EMAIL WALL", "label"),
                t("Where Work Lives Now", "h1"),
                t(
                    "4,000 workers, 14 industries, and the clearest picture yet of how hybrid actually settled. Read the findings here or take the ninety pages to go.",
                    "subtitle",
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(538, 1700, 1100), 0.55),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "topline",
            row(
                stat("54%", "of knowledge work is hybrid, and holding"),
                stat("71%", "of office time is now meetings"),
                stat("68%", "of new postings are location-flexible"),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "findings",
            group(
                t("THE FOUR FINDINGS", "label"),
                row(
                    group(
                        img(pic(539), 1.4),
                        t("Hybrid calcified", "h3"),
                        t("The experiment ended; the settlement is two anchored days.", "caption"),
                    ),
                    group(
                        img(pic(540), 1.4),
                        t("Offices became meeting rooms", "h3"),
                        t("Focus work moved home and is not coming back.", "caption"),
                    ),
                    group(
                        img(pic(541), 1.4),
                        t("Mentorship pays the price", "h3"),
                        t("Unplanned senior contact fell 40% for workers under 30.", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "quote",
            group(
                testimonial(
                    "This is the dataset we quote in every workplace decision now. Nothing else out there is this current or this honest about its methods.",
                    "Ines Duarte",
                    "Head of Workplace, Bright Coast",
                    "https://i.pravatar.cc/240?img=20",
                ),
            ),
        ),
        section(
            "method",
            split(
                60,
                group(
                    t("THE METHOD, BRIEFLY", "label"),
                    t("4,000 workers, weighted, replicable.", "h2"),
                    t(
                        "Panel-recruited, census-weighted on five dimensions, fielded in March and April 2026. Every instrument, crosstab, and weighting decision ships in the appendix, because a finding you can't check is a press release.",
                        "body",
                    ),
                ),
                img(pic(542), 0.82),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
        section(
            "finding4",
            split(
                60,
                group(
                    t("AND THE FOURTH", "label"),
                    t("Distributed hiring became the quiet default.", "h2"),
                    t(
                        "68% of 2026 postings are location-flexible, applicant pools run 2.4× deeper, and the metro salary premium fell to 12%. The map stopped mattering faster than the org charts admit.",
                        "body",
                    ),
                ),
                img(pic(543), 0.82),
            ),
        ),
        section(
            "numbers2",
            group(
                t("BY THE NUMBERS", "label"),
                table(
                    "Measure,2019,2026\nFully remote,4%,22%\nHybrid,12%,54%\nOffice-first,84%,24%\nUnplanned senior contact · under-30s,Baseline,−40%",
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
        section(
            "press",
            group(
                t("COVERED BY", "label"),
                row(
                    fitW(t("THE ATLANTIC", "h3")),
                    fitW(t("FT WORK", "h3")),
                    fitW(t("PLACES JOURNAL", "h3")),
                    fitW(t("WORKLIFE", "h3")),
                ),
            ),
        ),
        section(
            "download",
            group(
                t("Take the ninety pages.", "h2"),
                t(
                    "PDF, data tables, and the citation file. Free forever; funded by our members.",
                    "subtitle",
                ),
                button("Download the report", "https://northwind.institute/work.pdf", {
                    size: "lg",
                }),
            ),
            { bleed: true, background: bgImage(pic(544, 1700, 1100), 0.55) },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Northwind Institute", "h3")),
                        fitW(t("Independent research on how work actually happens.", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("THE STUDY", "label")),
                        fitW(
                            linked(
                                "caption",
                                ["Download", "https://northwind.institute/work.pdf"],
                                " · ",
                                ["Data tables", "https://northwind.institute/work/data"],
                            ),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("CONTACT", "label")),
                        fitW(
                            linked("caption", [
                                "research@northwind.institute",
                                "mailto:research@northwind.institute",
                            ]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(545, 1700, 1100), 0.3),
);

export const changelogSite: ArtifactContent = web(
    "stark",
    [
        section(
            "hero",
            group(
                siteNav(
                    "VANTA",
                    navLink("Latest", "#latest"),
                    navLink("Earlier", "#earlier"),
                    navCta("Get Vanta", "https://vanta.app"),
                ),
                t("CHANGELOG", "label"),
                t("What changed, and why we bothered.", "h1"),
                t(
                    "Every release, newest first, written by the people who built it. No growth hacks disguised as features; if it's here, it made the product quieter.",
                    "subtitle",
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(546, 1700, 1100), 0.55),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "latest",
            group(
                t("NOVEMBER · 1.4", "label"),
                t("The rhythm release.", "h2"),
                t(
                    "Vanta now notices when your focus hours drift with the season and moves its quiet blocks with them. Built after we watched winter break everyone's October settings.",
                    "body",
                ),
                bullets(
                    "Focus hours follow your actual rhythm, reviewed monthly on-device",
                    "The queue got 40% faster on decade-old laptops, our favorite benchmark",
                    "New: one keystroke sends any window to tomorrow morning",
                ),
            ),
        ),
        section(
            "earlier",
            group(
                t("EARLIER", "label"),
                dish(
                    "October · 1.3",
                    "the offline release",
                    "Drafting and summaries now run fully on-device; the network light stays dark",
                ),
                dish(
                    "September · 1.2",
                    "the calendar truce",
                    "Meetings block focus time automatically, and vice versa, and both sides win",
                ),
                dish(
                    "August · 1.1",
                    "the first apology",
                    "We shipped badges in 1.0; we're sorry; they're gone",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "principles",
            group(
                t("WHAT SHIPS AND WHAT NEVER WILL", "label"),
                bullets(
                    "Ships: anything that removes a decision from your day",
                    "Never: streaks, badges, or anything that wants you back",
                    "Never: your data leaving the machine, even for our convenience",
                ),
            ),
            { bleed: true, background: bgImage(pic(547, 1700, 1100), 0.7) },
        ),
        section(
            "asked",
            group(
                t("MOST REQUESTED, WITH VERDICTS", "label"),
                table(
                    "Request,Votes,Verdict\nAndroid,914,Building · spring\nCalendar two-way sync,610,Shipped in 1.2\nThemes,244,One more theme · then we stop\nStreaks,198,Never · see principles",
                ),
            ),
        ),
        section(
            "numbers",
            row(
                stat("14", "releases since 1.0"),
                stat("0", "features that want you back"),
                stat("40%", "faster on decade-old laptops"),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
        section(
            "written",
            group(
                testimonial(
                    "The only changelog I read for pleasure. August's apology should be taught in product schools.",
                    "A reader",
                    "who emailed, unprompted",
                    "https://i.pravatar.cc/240?img=26",
                ),
            ),
        ),
        section(
            "subscribe",
            group(
                t("One email per release, four lines long.", "h2"),
                button("Subscribe to the changelog", "https://vanta.app/changelog", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(548, 1700, 1100), 0.5) },
        ),
        section(
            "desk",
            split(
                60,
                group(
                    t("WHERE IT'S MADE", "label"),
                    t("Two people, one room, no roadmap wall.", "h2"),
                    t(
                        "Every entry above was built, tested, and written by the same two hands. The queue of ideas lives on index cards; the ones that survive winter get built in spring.",
                        "body",
                    ),
                ),
                img(pic(549), 0.82),
            ),
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Vanta", "h3")),
                        fitW(t("The workspace that disappears.", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("ELSEWHERE", "label")),
                        fitW(
                            linked("caption", ["vanta.app", "https://vanta.app"], " · ", [
                                "The waitlist",
                                "https://vanta.app/waitlist",
                            ]),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("WRITE TO US", "label")),
                        fitW(linked("caption", ["hello@vanta.app", "mailto:hello@vanta.app"])),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
    ],
    bgImage(pic(550, 1700, 1100), 0.3),
);

export const openMetrics: ArtifactContent = web(
    "clay",
    [
        section(
            "hero",
            group(
                siteNav(
                    "CADENCE",
                    navLink("The numbers", "#numbers"),
                    navLink("Commentary", "#commentary"),
                    navLink("Why open", "#why"),
                    navCta("Try Cadence", "https://cadence.dev"),
                ),
                t("OPEN METRICS · UPDATED MONTHLY", "label"),
                t("Our dashboard, in public.", "h1"),
                t(
                    "Revenue, retention, and runway, published since the month we started. Investors get nothing you can't see here.",
                    "subtitle",
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(551, 1700, 1100), 0.6),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "numbers",
            row(
                stat("$248K", "MRR · +16% MoM"),
                stat("124%", "net revenue retention"),
                stat("21 mo", "runway at current burn"),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "detail",
            group(
                t("THE LONG TABLE", "label"),
                table(
                    "Metric,May,June,July,August\nMRR,$248K,$263K,$281K,$302K\nNew logos,14,11,16,18\nLogo churn,1.1%,1.4%,0.9%,1.0%\nTeam size,19,19,21,22",
                ),
            ),
        ),
        section(
            "commentary",
            split(
                60,
                group(
                    t("AUGUST, HONESTLY", "label"),
                    t("Best month ever, with an asterisk.", "h2"),
                    t(
                        "$302K MRR and 18 new logos read great; two of those logos are pilots that convert or churn in Q4, and infra costs jumped 22% before our autoscaling fix landed. September's number tells us if the fix held. We'll write it here either way.",
                        "body",
                    ),
                ),
                img(pic(552), 0.82),
            ),
        ),
        section(
            "why",
            group(
                t("WHY WE PUBLISH", "label"),
                t("Sunlight is a forcing function.", "h2"),
                t(
                    "We sell billing software to usage-based startups; asking for your revenue pipeline means showing ours. Publishing monthly keeps our own numbers clean, our story straight, and our worst quarter on the record next to our best.",
                    "body",
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
        section(
            "history",
            split(
                40,
                img(pic(553), 1.05),
                group(
                    t("THE WORST MONTH, KEPT UP", "label"),
                    t("March 2025 stays on the page.", "h2"),
                    t(
                        "MRR fell 6%, two logos churned loudly, and the commentary that month was hard to write. It stays published because the good months only mean something next to it.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "principles",
            group(
                t("THE RULES WE PUBLISH BY", "label"),
                checks(
                    "Same metrics, same definitions, every month, no vanity swaps",
                    "Bad months get the same word count as good ones",
                    "Customer names only with written permission",
                    "If we ever stop publishing, the last post says why",
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
        section(
            "peers",
            group(
                t("OTHERS DOING THIS", "label"),
                t(
                    "We keep a list of open-metrics companies we admire and steal formatting from, because sunlight compounds when it spreads.",
                    "body",
                ),
                linked("caption", "The list: ", [
                    "cadence.dev/open-friends",
                    "https://cadence.dev/open-friends",
                ]),
            ),
        ),
        section(
            "cta",
            group(
                t("Metering your revenue? That's the product.", "h2"),
                button("Try Cadence free", "https://cadence.dev", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(554, 1700, 1100), 0.6) },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Cadence", "h3")),
                        fitW(t("Billing for usage-based software.", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("THE NUMBERS", "label")),
                        fitW(t("Updated the first Monday, since 2024", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("ASK ANYTHING", "label")),
                        fitW(
                            linked("caption", [
                                "metrics@cadence.dev",
                                "mailto:metrics@cadence.dev",
                            ]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(555, 1700, 1100), 0.28),
);

export const statusPage: ArtifactContent = web(
    "graphite",
    [
        section(
            "hero",
            group(
                siteNav(
                    "NORTHWIND STATUS",
                    navLink("Systems", "#systems"),
                    navLink("History", "#history"),
                    navCta("Subscribe", "#subscribe"),
                ),
                t("ALL SYSTEMS OPERATIONAL", "label"),
                t("Boring, as designed.", "h1"),
                t(
                    "Live status for every Northwind system, the ninety-day record, and the honest write-up whenever we break something.",
                    "subtitle",
                ),
                t("Last checked 40 seconds ago · Updates every minute", "caption"),
            ),
            { bleed: true, background: bgTone("contrast"), frame: { aspect: 16 / 9 } },
        ),
        section(
            "systems",
            group(
                t("SYSTEMS", "label"),
                checks(
                    "Dashboards & app · operational",
                    "Data ingestion · operational",
                    "Alerts & digests · operational",
                    "API · operational",
                    "Embeds · operational",
                ),
            ),
        ),
        section(
            "uptime",
            group(
                t("NINETY DAYS", "label"),
                table(
                    "System,Uptime,Worst day\nApp,99.99%,Aug 12 · 4 min deploy blip\nIngestion,99.97%,Jul 30 · vendor outage\nAPI,100%,Clean quarter\nAlerts,99.98%,Aug 2 · delayed 6 min",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "history",
            group(
                t("INCIDENT HISTORY", "label"),
                dish(
                    "Jul 30",
                    "41 min",
                    "Upstream queue outage delayed ingestion; no data lost; buffered and replayed",
                ),
                dish(
                    "Jun 14",
                    "12 min",
                    "Bad deploy slowed dashboards; rolled back; deploy gate added",
                ),
                dish(
                    "May 3",
                    "0 min",
                    "Precautionary failover during provider maintenance; nobody noticed, which was the point",
                ),
                t("Every incident gets a public post-mortem within five working days.", "caption"),
            ),
        ),
        section(
            "postmortem",
            group(
                t("THE LATEST POST-MORTEM, SUMMARIZED", "label"),
                t("July 30: the 41 minutes, explained.", "h2"),
                t(
                    "An upstream queue provider failed over without draining. Our buffer held every event; ingestion replayed clean within the hour. What changed: we now drain-test that failover monthly, and the vendor knows we publish these.",
                    "body",
                ),
                linked("caption", "Full write-up: ", [
                    "status.northwind.dev/pm/2026-07-30",
                    "https://status.northwind.dev/pm/2026-07-30",
                ]),
            ),
            { bleed: true, background: bgImage(pic(556, 1700, 1100), 0.66) },
        ),
        section(
            "principles",
            group(
                t("HOW WE RUN STATUS", "label"),
                checks(
                    "Status flips before the tweetstorm, not after",
                    "Every incident gets a public post-mortem in five working days",
                    "Scheduled maintenance appears here a week out, always",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "subscribe",
            group(
                t("Hear about it from us first.", "h2"),
                t(
                    "Email or webhook, the moment status changes. Median notice: 90 seconds.",
                    "subtitle",
                ),
                button("Subscribe to updates", "https://status.northwind.dev/subscribe", {
                    size: "lg",
                }),
            ),
            { bleed: true, background: bgTone("accent") },
        ),
        section(
            "oncall",
            split(
                60,
                group(
                    t("THE HUMANS BEHIND THE GREEN", "label"),
                    t("Four engineers, one quiet pager.", "h2"),
                    t(
                        "On-call rotates weekly, pages have fallen 70% in two years, and every alert that wakes someone gets a follow-up ticket asking why it had to. Boring status is an engineering budget, spent deliberately.",
                        "body",
                    ),
                ),
                img(pic(557), 0.82),
            ),
        ),
        section(
            "watch",
            group(
                t("WHAT WE MEASURE FROM OUTSIDE", "label"),
                bullets(
                    "Synthetic checks from six regions, every 30 seconds",
                    "Real-user timings from the app itself, sampled at 10%",
                    "A dead-man's switch: if status can't update, that IS the incident",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Northwind Status", "h3")),
                        fitW(t("Independent of the app it watches.", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("HISTORY", "label")),
                        fitW(
                            linked("caption", [
                                "All post-mortems",
                                "https://status.northwind.dev/history",
                            ]),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("REACH US", "label")),
                        fitW(
                            linked("caption", [
                                "status@northwind.dev",
                                "mailto:status@northwind.dev",
                            ]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(558, 1700, 1100), 0.3),
);

// you & your work: the personal wing's decks, papers, and pages

export const conferenceTalk: ArtifactContent = deck(
    "vellum",
    [
        section(
            "title",
            group(
                t("SMALL SOFTWARE CONF · LISBON", "label"),
                t("Making Things Small", "h1"),
                t(
                    "A talk about building software that ends, tools that stay quiet, and why less has been the whole point all along.",
                    "subtitle",
                ),
                t("Wren Halloran · Quiet Machines · 25 minutes", "caption"),
            ),
            { background: bgImage(pic(559, 1700, 1100), 0.55) },
        ),
        section(
            "who",
            split(
                60,
                group(
                    t("WHO'S TALKING", "label"),
                    t("I ship tools four people love.", "h2"),
                    t(
                        "Ten years between writing and design, three products still alive and maintained, and a weekly letter to 24,000 people about paying attention. Everything I know fits in this talk, which is the first lesson.",
                        "body",
                    ),
                ),
                img(pic(560), 0.82),
            ),
        ),
        section(
            "claim",
            group(
                t("THE CLAIM", "label"),
                t("Software rots from ambition, not age.", "h1"),
                t("Every dead product I've loved died of a roadmap.", "subtitle"),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "one",
            split(
                40,
                img(pic(561), 1.05),
                group(
                    t("LESSON ONE", "label"),
                    t("Decide what it will never do.", "h2"),
                    t(
                        "Margin has no feed, no algorithm, and no expiry, and those three sentences took two years to earn. The feature you refuse defines the product more than the ten you ship.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "two",
            split(
                60,
                group(
                    t("LESSON TWO", "label"),
                    t("Charge money, stay small, sleep.", "h2"),
                    t(
                        "Margin makes a modest living from people who pay for it twice, as one reader put it. No investors means no growth theater, and no growth theater means the roadmap fits on an index card, which is the correct size.",
                        "body",
                    ),
                ),
                img(pic(562), 0.82),
            ),
        ),
        section(
            "three",
            split(
                40,
                img(pic(563), 1.05),
                group(
                    t("LESSON THREE", "label"),
                    t("Finish things. It's allowed.", "h2"),
                    t(
                        "The Attention Book will ship, be done, and never get an update, like books have managed for five hundred years. A finished thing is not a dead thing; it is a kept promise.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "evidence",
            group(
                t("THE RECEIPTS", "label"),
                row(
                    stat("10 yrs", "of Margin's data retention promise, kept"),
                    stat("3", "products alive · zero pivots"),
                    stat("24K", "readers who chose slower software"),
                ),
            ),
        ),
        section(
            "counter",
            split(
                60,
                group(
                    t("THE OBJECTION I ALWAYS GET", "label"),
                    t("Doesn't small mean irrelevant?", "h2"),
                    t(
                        "Basecamp is small. Pinboard was one person. The tools you'll still use in 2040 are being built by teams who can share one pizza, because they're the only ones whose incentives let software finish.",
                        "body",
                    ),
                ),
                img(pic(564), 0.82),
            ),
        ),
        section(
            "quote",
            group(
                quote(
                    "Every dead product I've loved died of a roadmap.",
                    "The line people tweet · so it goes on its own slide",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "close",
            group(
                t("Build something that ends.", "h1"),
                t("Slides, the reading list, and the letter: quietmachines.co/talk", "subtitle"),
                t("Thank you. Questions welcome, small ones especially.", "caption"),
            ),
            { background: bgImage(pic(565, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(566, 1700, 1100), 0.3),
);

export const portfolioDeck: ArtifactContent = deck(
    "studio",
    [
        section(
            "cover",
            group(
                t("ELENA MARIS VANCE · SELECTED WORK", "label"),
                t("Calm, durable software.", "h1"),
                t(
                    "Nine years of product design for tools people open every day: three projects, the decisions inside them, and what shipped.",
                    "subtitle",
                ),
                t("Prepared for the Northwind design team · 12 minutes", "caption"),
            ),
            { background: bgImage(pic(567, 1700, 1100), 0.55) },
        ),
        section(
            "p1",
            split(
                60,
                group(
                    t("01 · ASTER DESIGN SYSTEM", "label"),
                    t("Four teams, one voice, 80 components.", "h2"),
                    t(
                        "A fractured UI became one coherent system: tokens, components, and the usage guidelines that made adoption feel like relief instead of homework. Documented, versioned, and adopted across web and mobile without a mandate.",
                        "body",
                    ),
                    t(
                        "Impact: new-feature design time down 40% · brand drift, visibly gone",
                        "caption",
                    ),
                ),
                img(pic(568), 0.82),
            ),
        ),
        section(
            "numbers",
            row(
                stat("9 yrs", "designing shipping product"),
                stat("40k+", "businesses on my last product"),
                stat("80", "components in the system that stayed"),
            ),
        ),
        section(
            "p2",
            split(
                40,
                img(pic(569), 1.05),
                group(
                    t("02 · MERCHANT DASHBOARD 2.0", "label"),
                    t("The redesign that read like a receipt.", "h2"),
                    t(
                        "Payments data for 40,000 small businesses, rebuilt around the one question every owner asks: where's my money. Weekly active use rose 34%, and time-to-first-invoice fell from 11 minutes to under 3.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "p3",
            split(
                60,
                group(
                    t("03 · CADENCE CARE PLANS", "label"),
                    t("Chronic care, without the dread.", "h2"),
                    t(
                        "Onboarding and daily tracking for a health app that grew from 5k to 220k monthly users. The accessibility overhaul took every core flow from WCAG A to AA, and the 40-patient research sprint reframed the entire care-plan model.",
                        "body",
                    ),
                ),
                img(pic(570), 0.82),
            ),
        ),
        section(
            "how",
            group(
                t("HOW I WORK", "label"),
                bullets(
                    "Prototype in code when fidelity matters, in paper when speed does",
                    "The edge cases and empty states are the design, not the cleanup",
                    "Ship one flow that respects people's time over ten that demo well",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "practice",
            split(
                40,
                img(pic(571), 1.05),
                group(
                    t("THE THREAD", "label"),
                    t("Systems over screens.", "h2"),
                    t(
                        "All three projects are the same job in different clothes: find the pattern under forty screens, name it, and hand the team a language instead of a mockup. That job travels across any product domain.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "words",
            group(
                t("COLLEAGUES SAY", "label"),
                quote(
                    "Elena's specs read like well-written law: you can tell what to do in the cases she didn't draw.",
                    "Staff engineer · Merchant Dashboard team",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "offer",
            group(
                t("WHAT I'M LOOKING FOR", "label"),
                bullets(
                    "A team that ships weekly and reads its support tickets",
                    "Design systems work or 0-to-1 with systems ambitions",
                    "Hybrid SF or fully remote · start date flexible",
                ),
            ),
        ),
        section(
            "close",
            group(
                t("Let's build the quiet version.", "h2"),
                linked("subtitle", ["elena@vance.design", "mailto:elena@vance.design"], " · ", [
                    "vance.design",
                    "https://vance.design",
                ]),
            ),
            { background: bgImage(pic(572, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(573, 1700, 1100), 0.3),
);

export const teachingDeck: ArtifactContent = deck(
    "brut",
    [
        section(
            "cover",
            group(
                t("WORKSHOP · 90 MINUTES · BRING A LAPTOP", "label"),
                t("Design systems that survive reorgs.", "h1"),
                t(
                    "A working session on building component systems that outlive their authors, their sponsors, and the next org chart.",
                    "subtitle",
                ),
                t("Elena Vance · Config 2026 workshop track", "caption"),
            ),
            { background: bgImage(pic(574, 1700, 1100), 0.6) },
        ),
        section(
            "premise",
            group(
                t("THE PREMISE", "label"),
                t("Systems don't die of bad tokens.", "h2"),
                t(
                    "They die when the one person who understood the versioning leaves, when a reorg orphans the repo, and when adoption was always one team deep. Today is about the boring structures that prevent all three.",
                    "body",
                ),
            ),
        ),
        section(
            "agenda",
            group(
                t("THE 90 MINUTES", "label"),
                table(
                    "Block,Minutes,What we do\nAutopsies,20,Three dead systems · what actually killed them\nExercise one,25,Stress-test your governance on paper\nExercise two,25,Write the two-paragraph succession plan\nThe rule,10,One rule that outlives everything\nQuestions,10,Including the awkward ones",
                ),
            ),
        ),
        section(
            "exercise",
            split(
                60,
                group(
                    t("THE CORE EXERCISE", "label"),
                    t("Kill your system on paper first.", "h2"),
                    bullets(
                        "Your sponsor quits Monday: who signs the next breaking change?",
                        "Two teams fork the button: which one is canonical, says who?",
                        "Budget halves: what do you stop documenting first?",
                    ),
                ),
                img(pic(575), 0.82),
            ),
        ),
        section(
            "rule",
            group(t("THE ONE RULE", "label"), t("If it needs you, it isn't a system yet.", "h1")),
            { background: bgTone("accent") },
        ),
        section(
            "cases",
            group(
                t("THE THREE AUTOPSIES", "label"),
                table(
                    "System,Lifespan,Cause of death\nA fintech's 'Polaris',3 years,Sponsor left · repo orphaned in the reorg\nAn agency's kit,18 months,One team deep · died with the contract\nA unicorn's system,5 years · alive,Survived twice · we study why",
                ),
            ),
        ),
        section(
            "takeaway",
            split(
                40,
                img(pic(576), 1.05),
                group(
                    t("THE TWO-PARAGRAPH SUCCESSION PLAN", "label"),
                    t("Write the obituary before the birth.", "h2"),
                    t(
                        "Paragraph one: who inherits, by role not name. Paragraph two: what gets deleted when nobody does. Teams that write this ship calmer systems, because scarcity was designed in.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "prep",
            group(
                t("BEFORE YOU ARRIVE", "label"),
                checks(
                    "Bring your system's repo URL and its bus factor, honestly counted",
                    "Know who signed your last breaking change",
                    "Install nothing; paper beats laptops for the first hour",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "close",
            group(
                t("Templates, checklists, and the autopsies.", "h2"),
                linked("subtitle", "Everything from today: ", [
                    "vance.design/workshop",
                    "https://vance.design/workshop",
                ]),
                t("Stay for the hallway; that's where the real questions live.", "caption"),
            ),
            { background: bgImage(pic(577, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(578, 1700, 1100), 0.3),
);

export const yearInReview: ArtifactContent = deck(
    "atelier",
    [
        section(
            "cover",
            group(
                t("A PERSONAL ACCOUNTING", "label"),
                t("2026, in small things", "h1"),
                t(
                    "One year, counted honestly: the photographs, the miles, the mornings, and the handful of moments that turned out to be the point.",
                    "subtitle",
                ),
                t("Jonah Reyes · made in the last week of December", "caption"),
            ),
            { background: bgImage(pic(579, 1700, 1100), 0.55) },
        ),
        section(
            "numbers",
            row(
                stat("14,206", "photographs, 31 worth keeping"),
                stat("1,940 km", "walked, mostly before 7am"),
                stat("52", "Sunday calls home, unbroken"),
            ),
        ),
        section(
            "spring",
            split(
                40,
                img(pic(580), 1.05),
                group(
                    t("SPRING", "label"),
                    t("The essay got published.", "h2"),
                    t(
                        "Before the City Wakes ran in March, and strangers wrote to say they'd started waking early. The city didn't change; the inbox did. Best thing I made all year, and it was made of mornings.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "summer",
            split(
                60,
                group(
                    t("SUMMER", "label"),
                    t("I learned to be terrible at surfing.", "h2"),
                    t(
                        "Four months of Saturdays, one wave ridden clean, and a standing appointment with humility. Recommended without reservation.",
                        "body",
                    ),
                ),
                img(pic(581), 0.82),
            ),
        ),
        section(
            "fall",
            split(
                40,
                img(pic(582), 1.05),
                group(
                    t("FALL", "label"),
                    t("Grandpa's letters, finally scanned.", "h2"),
                    t(
                        "Two hundred and six of them, 1961 to 1989, archived and shared with the cousins. The family group chat went quiet for a week in the best way.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "lessons",
            group(
                t("WHAT THE YEAR ARGUED", "label"),
                bullets(
                    "The early hour is undefeated; everything good started before eight",
                    "Counting things is a way of caring about them",
                    "Finish the small project; the big one is usually a costume it wears",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "gallery",
            group(
                t("TWELVE MONTHS, SIX FRAMES", "label"),
                col(
                    { align: "center" },
                    w(38, group(img(pic(583), 1.4), t("July, wave number one", "caption"))),
                ),
                pin(
                    w(24, polaroid(pic(584, 900, 700), 1.4, "January, the bridge to myself")),
                    "start",
                    "center",
                    {
                        dx: 40,
                        rotate: -5,
                        z: 1,
                    },
                ),
                pin(
                    w(24, polaroid(pic(585, 900, 700), 1.4, "December, the cousins' sparklers")),
                    "end",
                    "center",
                    {
                        dx: -40,
                        rotate: 4,
                        z: 1,
                    },
                ),
            ),
        ),
        section(
            "failures",
            group(
                t("HONORABLE FAILURES", "label"),
                bullets(
                    "The novel: 40 pages, then honorably shelved for the essay",
                    "Running a marathon: became running most mornings, which is better",
                    "Inbox zero: achieved twice · witnessed once",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "thanks",
            group(
                quote(
                    "Counting things is a way of caring about them.",
                    "The year's working theory · held up",
                ),
            ),
        ),
        section(
            "next",
            group(
                t("2027, provisionally", "h2"),
                t(
                    "More mornings, the second essay, and one wave ridden with witnesses.",
                    "subtitle",
                ),
            ),
            { background: bgImage(pic(586, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(587, 1700, 1100), 0.3),
);

export const sideProjectPitch: ArtifactContent = deck(
    "vellum",
    [
        section(
            "cover",
            group(
                t("MARGIN 2.0 · A SMALL PITCH", "label"),
                t("The reading app grows up, barely.", "h1"),
                t(
                    "Margin saves what you read and never loses it. 2.0 is the version I've owed the four thousand people who pay for it: the rebuild, the reader, and nothing else.",
                    "subtitle",
                ),
                t("Wren Halloran · pitching collaborators, not capital", "caption"),
            ),
            { background: bgImage(pic(588, 1700, 1100), 0.55) },
        ),
        section(
            "what",
            split(
                60,
                group(
                    t("WHAT MARGIN IS", "label"),
                    t("A library, not a feed.", "h2"),
                    t(
                        "Save anything, highlight freely, and trust it will still be there in ten years. No algorithm, no social layer, no expiry. It gets more valuable the longer you tend it, like a shelf.",
                        "body",
                    ),
                ),
                img(pic(589), 0.82),
            ),
        ),
        section(
            "numbers",
            row(
                stat("4,100", "paying readers"),
                stat("$71K", "a year, after fees"),
                stat("31%", "open the app daily"),
            ),
        ),
        section(
            "twozero",
            group(
                t("WHAT 2.0 ADDS", "label"),
                bullets(
                    "The rebuilt reader: typography worth the name, offline everything",
                    "One-tap send from anywhere, finally including email newsletters",
                    "Nothing else; forty feature requests politely declined and archived",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "plan",
            group(
                t("THE PLAN", "label"),
                table(
                    "When,What,State\nJanuary,Reader beta to the letter's readers,Designed\nMarch,2.0 ships · price stays $4,On track\nJune,The API three people asked for,If the spring is kind",
                ),
            ),
        ),
        section(
            "reader",
            split(
                60,
                group(
                    t("THE REBUILT READER", "label"),
                    t("Typography worth the name.", "h2"),
                    bullets(
                        "Real margins, real leading, your type size remembered per book",
                        "Offline everything: planes are where reading happens",
                        "Highlights export to plain text, forever portable",
                    ),
                ),
                img(pic(590), 0.82),
            ),
        ),
        section(
            "principles",
            group(
                t("THE PRODUCT RULES", "label"),
                checks(
                    "No feed, no algorithm, no expiry, ever",
                    "Price stays $4; the business plan is patience",
                    "Every feature request answered, most with a kind no",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "words",
            group(
                quote(
                    "Margin is the only app I'd grieve. Everything else is replaceable.",
                    "A reader's email · the retention strategy in one line",
                ),
            ),
        ),
        section(
            "ask",
            group(
                t("THE ASK", "label"),
                t("One iOS contractor, three months, good taste.", "h2"),
                t(
                    "Paid properly from the product's own revenue. You'd be the second person ever to touch this codebase, and the first is friendly.",
                    "body",
                ),
                linked("caption", "Sound like you? ", [
                    "wren@quietmachines.co",
                    "mailto:wren@quietmachines.co",
                ]),
            ),
            { background: bgImage(pic(591, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(592, 1700, 1100), 0.3),
);

export const designCaseStudy: ArtifactContent = doc(
    "studio",
    [
        section(
            "head",
            group(
                t("CASE STUDY · DESIGN SYSTEMS", "label"),
                t("Aster: one voice for four teams", "h1"),
                t(
                    "How a fractured product UI became a design system with 80 components, real adoption, and no mandate from above. The decisions, the mistakes, and the numbers.",
                    "subtitle",
                ),
                t("Elena Vance · Lead Product Designer · 8 minute read", "caption"),
            ),
            { background: bgImage(pic(593, 1700, 1100), 0.55) },
        ),
        section(
            "problem",
            group(
                t("THE PROBLEM", "label"),
                t("Four teams, four button heights, one brand.", "h2"),
                t(
                    "By 2023 the product had 23 shades of gray, three date pickers, and a design review process that mostly relitigated spacing. New designers took a month to learn which patterns were load-bearing. Nobody owned the whole, so the whole drifted.",
                    "body",
                ),
            ),
        ),
        section(
            "bet",
            split(
                60,
                group(
                    t("THE BET", "label"),
                    t("Adoption over coverage.", "h2"),
                    t(
                        "Instead of building the complete system and announcing it, we shipped eight components that solved the loudest pain, embedded with the team that hurt most, and let the second team ask. Coverage came later; credibility came first.",
                        "body",
                    ),
                ),
                img(pic(594), 0.82),
            ),
        ),
        section(
            "numbers",
            row(
                stat("80", "components, documented"),
                stat("−40%", "new-feature design time"),
                stat("4 / 4", "teams adopted, zero mandated"),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "mistakes",
            group(
                t("WHAT I'D DO DIFFERENTLY", "label"),
                bullets(
                    "Version from day one; our first breaking change broke trust, not builds",
                    "Write the contribution guide before the tenth component, not the fiftieth",
                    "Put a designer AND an engineer on rotation; solo ownership was the fragile part",
                ),
            ),
        ),
        section(
            "process",
            group(
                t("THE PROCESS, IN PICTURES", "label"),
                row(
                    group(
                        img(pic(595), 1.4),
                        t("The audit wall: every gray, every button, every sin", "caption"),
                    ),
                    group(img(pic(596), 1.4), t("Token naming, round three of five", "caption")),
                    group(
                        img(pic(597), 1.4),
                        t("The first eight components, shipped embedded", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "governance",
            group(
                t("THE GOVERNANCE THAT STUCK", "label"),
                table(
                    "Question,Answer,Written where\nWho approves a new component?,Any two of the four team reps,CONTRIBUTING.md\nWho breaks an API?,RFC + a migration script,Versioning doc\nWho owns it after a reorg?,The role · not the person,The succession note",
                ),
            ),
        ),
        section(
            "quote",
            group(
                quote(
                    "The system survived two reorgs and a rebrand. That's the only metric that matters.",
                    "The line I put on my resume · because it's true",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "close",
            group(
                t("THE SYSTEM TODAY", "label"),
                t(
                    "Aster outlived my tenure, two reorgs, and a rebrand, which is the only metric that matters. The full component inventory, governance doc, and the before/after screens are at vance.design/aster.",
                    "body",
                ),
                linked("caption", ["vance.design/aster", "https://vance.design/aster"], " · ", [
                    "elena@vance.design",
                    "mailto:elena@vance.design",
                ]),
            ),
            { background: bgImage(pic(598, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(599, 1700, 1100), 0.3),
);

export const speakerKit: ArtifactContent = doc(
    "vellum",
    [
        section(
            "head",
            group(
                t("SPEAKER ONE-SHEET", "label"),
                t("Wren Halloran", "h1"),
                t(
                    "Writer and toolmaker. Talks about small software, durable tools, and the craft of paying attention, for rooms that prefer thinking to hype.",
                    "subtitle",
                ),
                t("Lisbon, most of the year · speaks in English & Portuguese", "caption"),
            ),
            { background: bgImage(pic(600, 1700, 1100), 0.55) },
        ),
        section(
            "bio",
            split(
                60,
                group(
                    t("THE BIO, TWO SIZES", "label"),
                    t(
                        "Short: Wren Halloran makes small, durable software and writes Slow Tools, a weekly letter about attention read by 24,000 people.",
                        "body",
                    ),
                    t(
                        "Longer: Wren spent a decade between editing and design before founding Quiet Machines, a two-person studio behind Margin and The Attention Book. Their talks argue, gently, that most software should be smaller, quieter, and finished.",
                        "body",
                    ),
                ),
                middle(
                    polaroid(
                        pic(601, 900, 1100),
                        0.82,
                        "Current headshot, print quality on request.",
                    ),
                ),
            ),
        ),
        section(
            "talks",
            group(
                t("CURRENT TALKS", "label"),
                dish(
                    "Making Things Small",
                    "25 min",
                    "Why software rots from ambition, and how to build things that end",
                ),
                dish(
                    "The Attention Ledger",
                    "40 min",
                    "What a decade of reading data taught me about how people actually focus",
                ),
                dish(
                    "Finished Software",
                    "keynote",
                    "A defense of tools that ship, settle, and stay",
                ),
            ),
        ),
        section(
            "logistics",
            group(
                t("THE PRACTICAL PART", "label"),
                bullets(
                    "Remote or in person; Lisbon departures, happy to batch European dates",
                    "No slides needed from you; I bring my own deck and a backup PDF",
                    "Recording is fine; the talk goes on my site 90 days later",
                    "Fee is honest and negotiable for nonprofits and student rooms",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "press",
            group(
                t("SAID ABOUT THE TALKS", "label"),
                quote(
                    "The rare conference talk people quoted at dinner. Quiet, funny, and structurally ruthless.",
                    "Organizer, Small Software Conf 2025",
                ),
            ),
        ),
        section(
            "clips",
            split(
                40,
                img(pic(602), 1.05),
                group(
                    t("WATCH FIRST", "label"),
                    t("Twelve minutes tells you everything.", "h2"),
                    t(
                        "The Small Software Conf recording is the honest sample: real audience, one flubbed slide handled fine, and the Q&A where the talk actually lives.",
                        "body",
                    ),
                    linked("caption", "The recording: ", [
                        "quietmachines.co/talks/small",
                        "https://quietmachines.co/talks/small",
                    ]),
                ),
            ),
        ),
        section(
            "hosted",
            group(
                t("ROOMS THIS YEAR", "label"),
                row(
                    fitW(t("SMALL SOFTWARE CONF", "h3")),
                    fitW(t("XOXO", "h3")),
                    fitW(t("HANDMADE SEATTLE", "h3")),
                    fitW(t("READING RHYTHMS LISBON", "h3")),
                ),
                t("Plus eleven podcasts, listed on the site, most of them still good.", "caption"),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "gallery",
            group(
                t("PHOTOS FOR YOUR PROGRAM", "label"),
                row(
                    group(img(pic(603), 1.4), t("The usual headshot · print-safe", "caption")),
                    group(img(pic(604), 1.4), t("On stage, Small Software Conf", "caption")),
                    group(img(pic(605), 1.4), t("The landscape crop, for wide layouts", "caption")),
                ),
            ),
        ),
        section(
            "contact",
            group(
                t("Book a talk.", "h2"),
                linked(
                    "body",
                    ["wren@quietmachines.co", "mailto:wren@quietmachines.co"],
                    " · photos & intro paragraphs: ",
                    ["quietmachines.co/speaking", "https://quietmachines.co/speaking"],
                ),
            ),
            { background: bgImage(pic(606, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(607, 1700, 1100), 0.3),
);

export const linkHub: ArtifactContent = web(
    "vellum",
    [
        section(
            "hero",
            group(
                t("WREN HALLORAN", "label"),
                t("Everything, one page.", "h1"),
                t(
                    "The letter, the apps, the book, and the ways to say hello. Bookmark this; everything else moves.",
                    "subtitle",
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(608, 1700, 1100), 0.6),
                frame: { aspect: 16 / 9 },
            },
        ),
        section(
            "links",
            group(
                t("THE DOORS", "label"),
                dish(
                    "Slow Tools, the letter",
                    "weekly",
                    "One essay on attention, most Sunday mornings, 24,000 readers",
                ),
                dish("Margin, the reading app", "$4/mo", "Save anything, lose nothing, no feed"),
                dish(
                    "The Attention Book",
                    "out next year",
                    "A short, illustrated book on focus as a craft",
                ),
                dish("The essays", "free", "In Praise of Software That Ends, and the rest"),
            ),
        ),
        section(
            "now",
            group(
                t("NOW", "label"),
                t("Winter: heads-down on the Margin reader, letters as usual.", "body"),
                t("Updated December · the honest status, not the aspirational one", "caption"),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "latest",
            group(
                t("LATEST FROM THE LETTER", "label"),
                dish(
                    "In Praise of Software That Ends",
                    "9 min",
                    "The essay that keeps getting passed around · 2026",
                ),
                dish(
                    "The Last Honest Inbox",
                    "12 min",
                    "Why I rebuilt email for one person · me · 2025",
                ),
                dish(
                    "Notes on Making Things Small",
                    "7 min",
                    "A working theory of why less software outlives more",
                ),
            ),
        ),
        section(
            "photo",
            group(
                t("Lisbon, most mornings.", "h2"),
                t("The office is whichever café has the corner table free.", "caption"),
            ),
            { bleed: true, background: bgImage(pic(609, 1700, 1100), 0.5) },
        ),
        section(
            "gear",
            group(
                t("ASKED CONSTANTLY", "label"),
                dish("The pen", "Lamy 2000", "Twenty years, two nibs, zero drama"),
                dish("The keyboard", "quiet, obviously", "Reviewed in the letter · issue 141"),
                dish(
                    "The notebook",
                    "grid, softcover",
                    "One per season · archived like the letters",
                ),
            ),
        ),
        section(
            "readers",
            group(
                quote(
                    "Wren's letter is the only email I open before coffee.",
                    "A reader · representative of the inbox",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "hello",
            split(
                60,
                group(
                    t("Say hello.", "h2"),
                    linked(
                        "body",
                        ["wren@quietmachines.co", "mailto:wren@quietmachines.co"],
                        " · ",
                        ["Mastodon", "https://mastodon.social/@wrenhalloran"],
                        " · ",
                        ["Read.cv", "https://read.cv/wrenhalloran"],
                    ),
                    t("I reply to every note within two days, shorter ones faster.", "caption"),
                ),
                img(pic(610), 0.82),
            ),
        ),
    ],
    bgImage(pic(611, 1700, 1100), 0.3),
);

export const speakingPage: ArtifactContent = web(
    "studio",
    [
        section(
            "hero",
            group(
                siteNav(
                    "ELENA VANCE",
                    navLink("Talks", "#talks"),
                    navLink("Hosts say", "#hosts"),
                    navCta("Book Elena", "#book"),
                ),
                t("SPEAKING", "label"),
                t("Talks about calm, durable software.", "h1"),
                t(
                    "Design systems, accessibility, and the unglamorous middle of product work: talks for teams who ship, from someone still shipping.",
                    "subtitle",
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(612, 1700, 1100), 0.6),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "talks",
            group(
                t("THE TALKS", "label"),
                dish(
                    "Design systems that survive reorgs",
                    "45 min or workshop",
                    "The governance, succession, and adoption playbook, with autopsies",
                ),
                dish(
                    "The edge cases are the design",
                    "30 min",
                    "Empty states, error copy, and the craft of the unglamorous middle",
                ),
                dish(
                    "Accessible by default",
                    "45 min",
                    "How one team went from WCAG A to AA without a compliance panic",
                ),
            ),
        ),
        section(
            "hosts",
            group(
                t("HOSTS SAY", "label"),
                row(
                    testimonial(
                        "Highest-rated session of the conference, and the only one engineers and designers argued about at the same table after.",
                        "Programming chair",
                        "Config 2026",
                        "https://i.pravatar.cc/240?img=47",
                    ),
                    testimonial(
                        "Elena rebuilt her workshop around our team's actual system the night before. Nobody does that.",
                        "Head of Design",
                        "Meridian Bank",
                        "https://i.pravatar.cc/240?img=68",
                    ),
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "practical",
            group(
                t("THE PRACTICAL PART", "label"),
                bullets(
                    "San Francisco based; happy to pair talks with a team workshop day",
                    "Corporate, conference, and student rates, in that descending order",
                    "A recording for your team's library is always included",
                ),
            ),
        ),
        section(
            "formats",
            group(
                t("FORMATS", "label"),
                dish(
                    "The keynote",
                    "45 min",
                    "The full argument, with the autopsies and the one rule",
                ),
                dish(
                    "The workshop day",
                    "up to 6 hrs",
                    "Your actual system on the table · NDAs welcome",
                ),
                dish(
                    "The team talk",
                    "60 min remote",
                    "Your design org, your questions, cameras optional",
                ),
            ),
        ),
        section("photo", group(t("Rooms are where the work argues back.", "h2")), {
            bleed: true,
            background: bgImage(pic(613, 1700, 1100), 0.6),
        }),
        section(
            "logistics",
            group(
                t("BOOKING NOTES", "label"),
                checks(
                    "Book eight weeks out for conferences, three for team talks",
                    "Slides ship to you after · recording rights included",
                    "One student-room talk per quarter, free, first come",
                ),
            ),
        ),
        section(
            "book",
            group(
                t("Book a talk or a workshop day.", "h2"),
                t(
                    "Tell me the room, the team, and what should be different afterward.",
                    "subtitle",
                ),
                button("Email elena@vance.design", "mailto:elena@vance.design", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(614, 1700, 1100), 0.55) },
        ),
        section(
            "workshop",
            split(
                40,
                img(pic(615), 1.05),
                group(
                    t("THE WORKSHOP DAY, UP CLOSE", "label"),
                    t("Paper first, laptops after lunch.", "h2"),
                    t(
                        "Morning is autopsies and governance on paper; afternoon runs against your live system with your own components on the wall. Teams leave with a succession plan two paragraphs long and oddly reassuring.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Elena Vance", "h3")),
                        fitW(t("Product designer · San Francisco", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("THE WORK", "label")),
                        fitW(
                            linked("caption", ["vance.design", "https://vance.design"], " · ", [
                                "The Aster case study",
                                "https://vance.design/aster",
                            ]),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("BOOK", "label")),
                        fitW(
                            linked("caption", ["elena@vance.design", "mailto:elena@vance.design"]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(616, 1700, 1100), 0.3),
);

export const appSite: ArtifactContent = web(
    "vellum",
    [
        section(
            "hero",
            group(
                siteNav(
                    "MARGIN",
                    navLink("How it works", "#how"),
                    navLink("Philosophy", "#philosophy"),
                    navLink("Pricing", "#pricing"),
                    navCta("Start reading", "https://margin.app/start"),
                ),
                t("THE READING APP THAT FORGETS NOTHING", "label"),
                t("Your library, not your feed.", "h1"),
                t(
                    "Save anything, highlight freely, and trust that it will still be there in ten years. Margin gets more valuable the longer you tend it.",
                    "subtitle",
                ),
                button("Start your library", "https://margin.app/start", { size: "lg" }),
                pin(
                    w(
                        22,
                        card(
                            t("4.9 on the App Store", "label"),
                            t("12,400 ratings, most of them wordy.", "body"),
                        ),
                    ),
                    "end",
                    "end",
                    { dx: -28, dy: 108, z: 2 },
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(617, 1700, 1100), 0.55),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "how",
            group(
                t("HOW IT WORKS", "label"),
                row(
                    group(
                        img(pic(618), 1.4),
                        t("Save from anywhere", "h3"),
                        t(
                            "One tap from the share sheet, one click from the browser, or forward any email.",
                            "caption",
                        ),
                    ),
                    group(
                        img(pic(619), 1.4),
                        t("Read beautifully", "h3"),
                        t(
                            "Typography worth the name, offline always, in your type size.",
                            "caption",
                        ),
                    ),
                    group(
                        img(pic(620), 1.4),
                        t("Keep forever", "h3"),
                        t(
                            "No expiry, no algorithm, full export any time. It's your shelf.",
                            "caption",
                        ),
                    ),
                ),
            ),
        ),
        section(
            "philosophy",
            group(
                quote(
                    "Half my saved-articles graveyard is now things I've actually read, because Margin is the only place that doesn't rush me.",
                    "Theo Marsh · reader since 2021",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "pricing",
            group(
                t("PRICING", "label"),
                t("Four dollars a month. That's the pricing page.", "h2"),
                t(
                    "No tiers, no seats, no annual-only tricks. Free for 30 days, then $4, and your library exports in full the day you leave, though we'd rather you stayed.",
                    "body",
                ),
            ),
        ),
        section(
            "numbers",
            row(
                stat("4,100", "readers who pay for calm"),
                stat("10 yrs", "the retention promise, in writing"),
                stat("0", "notifications, as policy"),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
        section(
            "second",
            group(
                t("READERS SAY", "label"),
                row(
                    testimonial(
                        "I read forty saved essays on one flight. The app did nothing flashy, which is exactly the feature.",
                        "Dana K.",
                        "reader since 2023",
                        "https://i.pravatar.cc/240?img=32",
                    ),
                    testimonial(
                        "It's the only software I've paid for twice: once for me, once for my dad.",
                        "Theo Marsh",
                        "reader since 2021",
                        "https://i.pravatar.cc/240?img=12",
                    ),
                ),
            ),
        ),
        section(
            "faq",
            group(
                t("FAIR QUESTIONS", "label"),
                faq(
                    "collapsible",
                    [
                        [
                            "What happens if Margin shuts down?",
                            "The export button produces plain HTML and Markdown of everything, and the shutdown plan in our terms promises 12 months' notice. We build like books: to last.",
                        ],
                        [
                            "Is there a family plan?",
                            "The $4 covers you; gift subscriptions exist for everyone else, and half our growth is gifts.",
                        ],
                        [
                            "Android?",
                            "Spring. The web app works today and doesn't apologize for itself.",
                        ],
                    ],
                    true,
                ),
            ),
        ),
        section(
            "cta",
            group(
                t("Build the shelf your reading deserves.", "h2"),
                button("Start free for 30 days", "https://margin.app/start", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(621, 1700, 1100), 0.55) },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(col(fitW(t("Margin", "h3")), fitW(t("A Quiet Machines product.", "caption")))),
                fitW(
                    col(
                        fitW(t("MORE", "label")),
                        fitW(
                            linked(
                                "caption",
                                ["The changelog", "https://margin.app/changelog"],
                                " · ",
                                ["The letter", "https://slowtools.substack.com"],
                            ),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("SUPPORT", "label")),
                        fitW(linked("caption", ["help@margin.app", "mailto:help@margin.app"])),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
    ],
    bgImage(pic(622, 1700, 1100), 0.3),
);

// everyday & occasions: the decks and sites for the life side of the catalog

export const celebrationSlideshow: ArtifactContent = deck(
    "loft",
    [
        section(
            "title",
            group(
                t("SEPTEMBER 12 · THE STONE BARN", "label"),
                t("Amara & Théo", "h1"),
                t("Eight years, two cities, and one very good dog later.", "subtitle"),
                t("A few pictures before the first dance. Dinner is safe; cry freely.", "caption"),
            ),
            { background: bgImage(pic(623, 1700, 1100), 0.5) },
        ),
        section(
            "numbers",
            row(
                stat("8", "years since the rained-out queue"),
                stat("2", "cities called home"),
                stat("1", "very good dog, in a bow tie tonight"),
            ),
        ),
        section(
            "beginning",
            split(
                40,
                img(pic(624), 1.05),
                group(
                    t("HOW IT STARTED", "label"),
                    t("A film neither of them saw.", "h2"),
                    t(
                        "The screening was rained out; the queue was not. Two hours under one awning, and the movie has never once come up since.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "years",
            group(
                t("THE YEARS BETWEEN", "label"),
                row(
                    group(img(pic(625), 1.4), t("The Sintra hikes", "caption")),
                    group(
                        img(pic(626), 1.4),
                        t("Lagos, London, and every kitchen between", "caption"),
                    ),
                    group(img(pic(627), 1.4), t("The families, finally in one photo", "caption")),
                ),
            ),
        ),
        section(
            "words",
            group(
                quote(
                    "These two make everyone around them feel like the most interesting person in the room.",
                    "Lena · maid of honour · repeated tonight for the record",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "thanks",
            group(
                t("FROM THE TWO OF US", "label"),
                t("You crossed oceans for this. We noticed.", "h2"),
                t(
                    "To our parents, who started all of this; to the friends who moved boxes and held phones and kept secrets: tonight is yours too.",
                    "body",
                ),
            ),
        ),
        section(
            "dog",
            split(
                40,
                img(pic(628), 1.05),
                group(
                    t("A WORD ON BISCUIT", "label"),
                    t("The dog knew first.", "h2"),
                    pin(badge("Ring bearer, supervised"), "end", "start", {
                        dy: 4,
                        rotate: 5,
                        z: 2,
                    }),
                    t(
                        "Adopted the week they moved in together, present for the proposal (asleep), and tonight's ring bearer (supervised). He would like you to know the bow tie was not his idea.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "sintra",
            group(
                t("Why Sintra: the hills kept our secrets.", "h2"),
                t(
                    "Every anniversary walk ended at this quinta. Now you know why this address.",
                    "caption",
                ),
                pin(
                    w(24, polaroid(pic(629, 900, 700), 1.28, "an hour before the vows")),
                    "end",
                    "center",
                    {
                        dx: -28,
                        rotate: -6,
                        z: 1,
                    },
                ),
            ),
            { background: bgImage(pic(630, 1700, 1100), 0.5) },
        ),
        section(
            "table",
            group(
                t("TONIGHT, FOR THE RECORD", "label"),
                row(
                    stat("112", "guests from 9 countries"),
                    stat("14", "dishes from both grandmothers' books"),
                    stat("1", "sparkler send-off at midnight"),
                ),
            ),
        ),
        section(
            "dance",
            group(
                t("Now: the first dance.", "h1"),
                t("Then the floor is everyone's. Sparklers at midnight, on the drive.", "subtitle"),
            ),
            { background: bgImage(pic(631, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(632, 1700, 1100), 0.3),
);

export const triviaNight: ArtifactContent = deck(
    "arcade",
    [
        section(
            "title",
            group(
                t("THURSDAY · 8PM · THE BACK ROOM", "label"),
                t("Quiz Night No. 47", "h1"),
                t(
                    "Six rounds, one champion table, and the return of the music round nobody asked for.",
                    "subtitle",
                ),
                t("Teams of four to six · winners drink free · scores are final-ish", "caption"),
            ),
            { background: bgImage(pic(633, 1700, 1100), 0.6) },
        ),
        section(
            "rules",
            group(
                t("THE RULES, BRIEFLY", "label"),
                bullets(
                    "Phones face-down on the table; we can see you, Table Three",
                    "Answers in pen; charm changes nothing, bribes must be edible",
                    "The quizmaster is always right, especially when wrong",
                ),
            ),
        ),
        section(
            "rounds",
            group(
                t("TONIGHT'S ROUNDS", "label"),
                table(
                    "Round,Topic,Points\n1,General knowledge · warm-up,10\n2,Maps & flags,10\n3,The music round · 90s edition,15\n4,Food & drink,10\n5,Pictures · zoomed too far in,15\n6,The finale · wagers allowed,20",
                ),
            ),
        ),
        section(
            "tiebreak",
            group(
                t("THE TIEBREAKER", "label"),
                t("Closest number wins the night.", "h2"),
                t(
                    "One question, one number, no conferring limits. Last month's: how many meters of fairy lights are in this room? The answer was 214, and two tables cried.",
                    "body",
                ),
            ),
            { background: bgTone("accent") },
        ),
        section(
            "prizes",
            group(
                t("PRIZES", "label"),
                dish(
                    "First place",
                    "the tab",
                    "Your table's round is on the house, within reason, Marcus",
                ),
                dish(
                    "Second place",
                    "the hats",
                    "Championship hats · deeply coveted · mildly cursed",
                ),
                dish("Best team name", "one pitcher", "Judged on groans per syllable"),
            ),
        ),
        section(
            "history",
            group(
                t("HALL OF FAME", "label"),
                table(
                    "Month,Champions,Margin\nJuly,The Quizzly Bears,1 point\nJune,Let's Get Quizzical,4 points\nMay,The Quizzly Bears,tiebreaker\nApril,Agatha Quiztie,11 points · still discussed",
                ),
            ),
        ),
        section(
            "sample",
            split(
                60,
                group(
                    t("WARM-UP QUESTION", "label"),
                    t("Free point if your table talks to each other.", "h2"),
                    t(
                        "Which country consumes the most coffee per person: Finland, Italy, or the United States? Argue it out; the answer opens round one.",
                        "body",
                    ),
                ),
                img(pic(634), 0.82),
            ),
        ),
        section(
            "house",
            group(
                t("HOUSE NOTES", "label"),
                bullets(
                    "Kitchen open through round four; the flatbread ends arguments",
                    "Next month's theme round: 'Movies you pretend you've seen'",
                    "Bring a new table of four, both tables get a free pitcher",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "room",
            group(
                t("The back room, mid-round three.", "h2"),
                t("Someone is always this confident. They are rarely this correct.", "caption"),
            ),
            { background: bgImage(pic(635, 1700, 1100), 0.55) },
        ),
        section(
            "close",
            group(
                t("Pens up. Round one.", "h1"),
                t("Good luck, and remember: it's just a quiz, except it isn't.", "subtitle"),
            ),
            { background: bgImage(pic(636, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(637, 1700, 1100), 0.3),
);

export const travelRecap: ArtifactContent = deck(
    "graphite",
    [
        section(
            "title",
            group(
                t("TRIP REPORT · FOR THE GROUP CHAT", "label"),
                t("Iceland: the debrief.", "h1"),
                t(
                    "Five days, 1,340 km, seven waterfalls, and one car seat that will never fully dry.",
                    "subtitle",
                ),
                t("October 12 to 17 · as promised, with numbers", "caption"),
            ),
            { background: bgImage(pic(638, 1700, 1100), 0.5) },
        ),
        section(
            "numbers",
            row(
                stat("1,340", "kilometers driven"),
                stat("11", "hot pools, a personal best"),
                stat("0", "regrets · 1 near-miss with a sheep"),
            ),
        ),
        section(
            "best",
            group(
                t("THE PODIUM", "label"),
                pin(
                    w(18, polaroid(pic(639, 900, 700), 1.28, "Not pictured: the wind")),
                    "end",
                    "start",
                    {
                        dx: -6,
                        dy: -34,
                        rotate: 5,
                        z: 2,
                    },
                ),
                row(
                    group(
                        img(pic(640), 1.4),
                        t("Gold: behind Seljalandsfoss at 8am, soaked and alone", "caption"),
                    ),
                    group(
                        img(pic(641), 1.4),
                        t("Silver: the glacier lagoon doing its slow blue theater", "caption"),
                    ),
                    group(
                        img(pic(642), 1.4),
                        t("Bronze: Kp 5 aurora from a gas station parking lot", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "fails",
            group(
                t("HONORABLE FAILURES", "label"),
                bullets(
                    "The plane-wreck walk, into horizontal rain, both ways",
                    "One fermented shark cube each; never again; no photos survive",
                    "Believing the road sign that said 20 minutes; Iceland lies in kilometers",
                ),
            ),
            { background: bgTone("contrast") },
        ),
        section(
            "verdict",
            split(
                40,
                img(pic(643), 1.05),
                group(
                    t("THE VERDICT", "label"),
                    t("Go in the shoulder season. Go hungry.", "h2"),
                    t(
                        "October gave us empty trails, aurora nights, and langoustine without a reservation. Rent the 4x4, skip the itinerary apps, trust the hot dog stand.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "numbers2",
            group(
                t("THE LEDGER", "label"),
                table(
                    "Line,Count,Note\nHot dogs at the famous stand,6,Two each · no regrets\nWaterfalls walked behind,2,Soaked both times\nSheep encounters,31,One near-miss · see next slide\nTotal spend,$2.4K each,Flights included · worth double",
                ),
            ),
        ),
        section(
            "sheep",
            group(
                t("The near-miss, immortalized.", "h2"),
                t("It had right of way. It knew it had right of way.", "caption"),
            ),
            { background: bgImage(pic(644, 1700, 1100), 0.5) },
        ),
        section(
            "tips",
            group(
                t("STEAL THIS PLAYBOOK", "label"),
                checks(
                    "Book the 4x4, skip every tour, trust road.is over any app",
                    "Pools at 7am: locals, steam, and zero influencers",
                    "Grocery store hot dogs are a lie; the stand is not",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "close",
            group(
                t("Same crew, next fjord?", "h1"),
                t(
                    "The Faroes are 1 hour 20 from Reykjavík. Just saying. Vote in the chat.",
                    "subtitle",
                ),
            ),
            { background: bgImage(pic(645, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(646, 1700, 1100), 0.3),
);

export const birthdayToast: ArtifactContent = deck(
    "loft",
    [
        section(
            "title",
            group(
                t("SATURDAY · THE BACKYARD · 7PM", "label"),
                t("Rosa turns 60", "h1"),
                t(
                    "Six decades of feeding everyone, fixing everything, and dancing first.",
                    "subtitle",
                ),
                t("A few slides before cake. She has approved none of them.", "caption"),
            ),
            { background: bgImage(pic(647, 1700, 1100), 0.5) },
        ),
        section(
            "early",
            split(
                40,
                img(pic(648), 1.05),
                group(
                    t("THE EARLY YEARS", "label"),
                    t("Fastest kid on the beach, 1974.", "h2"),
                    t(
                        "Ask her about the bicycle race she won in a dress. Better: ask her sister, who has the accurate version.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "mom",
            split(
                60,
                group(
                    t("THE MOM DECADES", "label"),
                    t("Four kids, one rule: everybody eats.", "h2"),
                    t(
                        "The kitchen table sat six and regularly held eleven. Homework got checked, hems got fixed, and nobody left without a container of something.",
                        "body",
                    ),
                ),
                img(pic(649), 0.82),
            ),
        ),
        section(
            "numbers",
            row(
                stat("60", "years young tonight"),
                stat("4", "kids who turned out mostly fine"),
                stat("1,000s", "of Sunday dinners, minimum"),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "toasts",
            group(
                t("RAISE A GLASS", "label"),
                bullets(
                    "To the woman who taught us that showing up is the whole secret",
                    "To her salsa verde, which has ended arguments and started marriages",
                    "To the next sixty; she has plans, and we are not ready",
                ),
            ),
        ),
        section(
            "grand",
            split(
                40,
                img(pic(650), 1.05),
                group(
                    t("THE GRANDMA YEARS", "label"),
                    t("Retired from the hospital, never from the job.", "h2"),
                    t(
                        "Seven grandkids, one beach house rule (sunscreen before breakfast), and a group chat she runs like an air traffic controller. The kids' table has never once been quiet.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "salsa",
            group(
                t("THE FAMOUS SALSA VERDE, FINALLY DISCLOSED", "label"),
                dish("Tomatillos", "a dozen", "Charred on the comal she refuses to replace"),
                dish("The secret", "two limes", "Everyone guessed one · everyone was wrong"),
                dish("Availability", "Sundays", "And whenever someone looks like they need it"),
            ),
        ),
        section(
            "gallery",
            group(
                t("SIXTY YEARS, THREE FRAMES", "label"),
                row(
                    group(img(pic(651), 1.4), t("The beach, 1974", "caption")),
                    group(img(pic(652), 1.4), t("The school run era", "caption")),
                    group(img(pic(653), 1.4), t("Sunday coffee, last month", "caption")),
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "close",
            group(
                t("Happy birthday, Rosa.", "h1"),
                t("Cake now. Dancing after. She picked the playlist herself.", "subtitle"),
            ),
            { background: bgImage(pic(654, 1700, 1100), 0.5) },
        ),
    ],
    bgImage(pic(655, 1700, 1100), 0.3),
);

export const bookClub: ArtifactContent = deck(
    "gazette",
    [
        section(
            "title",
            group(
                t("THE TUESDAY BOOK CLUB · SEASON NINE", "label"),
                t("The winter list.", "h1"),
                t(
                    "Six books, six first Tuesdays, and the snack rule we finally wrote down.",
                    "subtitle",
                ),
                t("First meeting January 6 · Priya's place · 7:30", "caption"),
            ),
            { background: bgImage(pic(656, 1700, 1100), 0.55) },
        ),
        section(
            "list",
            group(
                t("THE SIX", "label"),
                dish(
                    "January · The Lighthouse Keepers",
                    "Ida Brandt",
                    "Norwegian modern classic · 210 pages · Priya hosts",
                ),
                dish(
                    "February · Salt & Cedar",
                    "M. Okonkwo",
                    "Food memoir · the one with the recipes · Dev hosts",
                ),
                dish(
                    "March · The Quiet Machine",
                    "R. Halloran",
                    "Essays on attention · short but dense · Sam hosts",
                ),
                dish(
                    "April · Small Rain",
                    "T. Aoki",
                    "The Tokyo novel everyone kept recommending · Priya again",
                ),
                dish(
                    "May · The Orchard Ledger",
                    "C. Vasquez",
                    "Multi-generation farm saga · 480 pages · start early · Marta",
                ),
                dish(
                    "June · Reread month",
                    "your pick",
                    "Bring the book you defend against all evidence · potluck",
                ),
            ),
        ),
        section(
            "rules",
            group(
                t("HOUSE RULES, SEASON NINE", "label"),
                bullets(
                    "Not finishing the book is fine; pretending you did is not",
                    "The snack rule: whoever hated the book most brings snacks next time",
                    "Spoiler-free until 8pm sharp for stragglers",
                    "One wildcard swap allowed per season, by majority groan",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "numbers",
            row(
                stat("9", "seasons and counting"),
                stat("52", "books argued about"),
                stat("2", "friendships tested · both recovered"),
            ),
        ),
        section(
            "last",
            split(
                60,
                group(
                    t("SEASON EIGHT, ADJUDICATED", "label"),
                    t("The verdicts are in.", "h2"),
                    bullets(
                        "Best book: The Salt Path · unanimous, suspiciously",
                        "Biggest fight: the unreliable narrator one · still unresolved",
                        "Snack champion: Dev's honey cake, three-time winner",
                    ),
                ),
                img(pic(657), 0.82),
            ),
        ),
        section(
            "how",
            group(
                t("HOW TUESDAYS RUN", "label"),
                table(
                    "Time,What\n7:30,Arrivals · wine open · no book talk yet\n8:00,Spoiler embargo lifts · the argument begins\n9:15,Next month's book defended by its nominator\n9:30,Officially over · actually over by 10:40",
                ),
            ),
            { background: bgTone("tint") },
        ),
        section(
            "quote",
            group(
                quote(
                    "Nine seasons and nobody has ever finished the June reread. It's tradition now.",
                    "Marta · founding member · keeper of the spreadsheet",
                ),
            ),
        ),
        section(
            "reading",
            group(
                t("Where the reading actually happens.", "h2"),
                t("Tuesday is the meeting; the book gets read wherever it gets read.", "caption"),
            ),
            { background: bgImage(pic(658, 1700, 1100), 0.55) },
        ),
        section(
            "snacks",
            group(
                t("SNACK HALL OF FAME", "label"),
                dish(
                    "Dev's honey cake",
                    "3 wins",
                    "Retired to the judges' table by popular demand",
                ),
                dish(
                    "Priya's chili crisp cookies",
                    "1 win",
                    "Divisive · which is the point of this club",
                ),
                dish(
                    "The June potluck",
                    "annual",
                    "Everyone brings the food of their reread's country",
                ),
            ),
        ),
        section(
            "close",
            group(
                t("January 6. Read the Brandt.", "h1"),
                t("Or at least the first hundred pages. We'll know.", "subtitle"),
            ),
            { background: bgImage(pic(659, 1700, 1100), 0.55) },
        ),
    ],
    bgImage(pic(660, 1700, 1100), 0.3),
);

export const partyInvite: ArtifactContent = web(
    "royal",
    [
        section(
            "hero",
            group(
                siteNav(
                    "L TURNS 40",
                    navLink("Details", "#details"),
                    navLink("The night", "#night"),
                    navCta("RSVP", "#rsvp"),
                ),
                t("YOU'RE INVITED · NOVEMBER 21", "label"),
                t("Léo turns 40.", "h1"),
                t(
                    "One long table, too many candles, and the good playlist. Dinner in the courtyard at Bar Amélie, and dancing after until they make us stop.",
                    "subtitle",
                ),
                button("RSVP by November 7", "#rsvp", { size: "lg" }),
            ),
            {
                bleed: true,
                background: bgImage(pic(661, 1700, 1100), 0.55),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "details",
            group(
                t("THE DETAILS", "label"),
                dish(
                    "When",
                    "Nov 21 · 7:30",
                    "Doors at 7:30 · seated at 8 · nobody seated after the soup",
                ),
                dish("Where", "Bar Amélie", "12 Rue des Carmes · the courtyard in back"),
                dish(
                    "Dress",
                    "nice-ish",
                    "Whatever makes you dance; the floor is cobblestone, plan heels accordingly",
                ),
                dish("Gifts", "none", "Your presence, a story about Léo, and your appetite"),
            ),
        ),
        section(
            "night",
            group(
                t("THE SHAPE OF THE NIGHT", "label"),
                table(
                    "Hour,What\n7:30,Aperitifs & the good olives\n8:00,Dinner · long table · no seating plan\n10:00,The toast · one story each · keep it kind-ish\n10:30,Cake & dancing\nLate,Digestifs for the survivors",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "leo",
            split(
                40,
                img(pic(662), 1.05),
                group(
                    t("ABOUT THE BIRTHDAY BOY", "label"),
                    t("Forty things we love; here are three.", "h2"),
                    bullets(
                        "Has never once let a visitor leave hungry",
                        "Claims he doesn't dance; the playlist says otherwise",
                        "Will deny this party was his idea · it was entirely his idea",
                    ),
                ),
            ),
        ),
        section(
            "stay",
            group(
                t("COMING FROM OUT OF TOWN?", "label"),
                dish(
                    "Sleep",
                    "Hôtel du Parc",
                    "Ten rooms held under 'Léo 40' until Nov 1 · two blocks away",
                ),
                dish(
                    "Trains",
                    "Gare Centrale",
                    "Last one back is 00:40 · the party will outlast it",
                ),
                dish(
                    "Sunday",
                    "recovery brunch",
                    "Same courtyard, 11am, dark sunglasses respected",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "toast",
            group(
                testimonial(
                    "Forty looks good on anyone who still closes the dance floor.",
                    "Amélie",
                    "proprietor & co-conspirator",
                    "https://i.pravatar.cc/240?img=47",
                ),
            ),
        ),
        section(
            "rsvp",
            group(
                t("Say you're coming.", "h2"),
                t(
                    "By November 7, so Amélie knows how much duck to order. Plus-ones welcome; babysitters encouraged.",
                    "subtitle",
                ),
                button("RSVP to Léo", "mailto:leo@fourzero.party", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(663, 1700, 1100), 0.55) },
        ),
        section(
            "courtyard",
            group(
                t("The courtyard, as it will look at ten.", "h2"),
                t(
                    "String lights, one long table, and the cobblestones your heels were warned about.",
                    "caption",
                ),
            ),
            { bleed: true, background: bgImage(pic(664, 1700, 1100), 0.5) },
        ),
        section(
            "moments",
            group(
                t("PREVIOUS LÉO PARTIES, FOR THE RECORD", "label"),
                row(
                    group(
                        img(pic(665), 1.4),
                        t("The 35th: sparklers, briefly confiscated", "caption"),
                    ),
                    group(img(pic(666), 1.4), t("The 38th: the dance floor at 1am", "caption")),
                    group(img(pic(667), 1.4), t("Every year: Amélie's lime shortbread", "caption")),
                ),
            ),
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Léo turns 40", "h3")),
                        fitW(t("November 21 · Bar Amélie", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("QUESTIONS", "label")),
                        fitW(
                            linked("caption", ["leo@fourzero.party", "mailto:leo@fourzero.party"]),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("CAN'T MAKE IT?", "label")),
                        fitW(t("Send a story for the toast book instead", "caption")),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(668, 1700, 1100), 0.3),
);

export const reunionSite: ArtifactContent = web(
    "gazette",
    [
        section(
            "hero",
            group(
                siteNav(
                    "LAKESIDE '16",
                    navLink("The night", "#night"),
                    navLink("Who's coming", "#coming"),
                    navCta("RSVP", "#rsvp"),
                ),
                t("TEN YEARS · CAN YOU BELIEVE IT", "label"),
                t("Lakeside High, Class of 2016.", "h1"),
                t(
                    "One night, the old gym, a better DJ than prom had, and everyone you've been meaning to catch up with. October 10. Come.",
                    "subtitle",
                ),
                button("RSVP now", "#rsvp", { size: "lg" }),
            ),
            {
                bleed: true,
                background: bgImage(pic(669, 1700, 1100), 0.55),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "night",
            group(
                t("THE NIGHT", "label"),
                dish(
                    "6:30",
                    "doors & name tags",
                    "Yearbook photos on them · yes really · blame the committee",
                ),
                dish("7:30", "dinner", "Catered by Rossi's, who also did prom, and has improved"),
                dish(
                    "9:00",
                    "the slideshow",
                    "Ten minutes · submit photos by October 1 · mercy shown to no one",
                ),
                dish(
                    "9:30",
                    "dancing",
                    "The DJ has the 2016 playlist and instructions to use it responsibly",
                ),
            ),
        ),
        section(
            "numbers",
            row(
                stat("87", "classmates already in"),
                stat("11", "states represented"),
                stat("3", "teachers promising to come"),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "coming",
            group(
                t("THEN VS NOW", "label"),
                bullets(
                    "The gym: same floor, better lighting, drinks allowed this time",
                    "Mr. Halvorsen retired but is bringing the trophy nobody returned",
                    "The time capsule gets opened at 9:15; the committee has not peeked, mostly",
                ),
            ),
        ),
        section(
            "memory",
            group(
                t("THE MEMORY WALL", "label"),
                t("Bring one photo, leave with a hundred.", "h2"),
                t(
                    "The committee is printing every submission for the gym wall: field trips, terrible haircuts, the drama club's entire archive. Digital copies go to everyone after; originals return to their owners, laminated whether they like it or not.",
                    "body",
                ),
            ),
        ),
        section(
            "faces",
            group(
                t("ALREADY CONFIRMED", "label"),
                row(
                    testimonial(
                        "Flying in from Portland. If Mr. H brings the trophy, I'm finally confessing.",
                        "Dana Okafor",
                        "Class treasurer · still organized",
                        "https://i.pravatar.cc/240?img=44",
                    ),
                    testimonial(
                        "I DJ'd prom off an iPod nano. I've been told the bar is higher now.",
                        "Marcus Webb",
                        "This time just dancing",
                        "https://i.pravatar.cc/240?img=15",
                    ),
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "give",
            group(
                t("THE CLASS GIFT", "label"),
                t("The library's makerspace, $10 at a time.", "h2"),
                t(
                    "Whatever the night raises past costs goes to Lakeside's library, matched by two classmates who did suspiciously well.",
                    "body",
                ),
            ),
        ),
        section(
            "rsvp",
            group(
                t("Ten years is long enough.", "h2"),
                t(
                    "$45 covers dinner and the first round. Scholarships quietly available; message Dana.",
                    "subtitle",
                ),
                button("RSVP & pay", "https://lakeside16.reunion.page/rsvp", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(670, 1700, 1100), 0.5) },
        ),
        section(
            "gallery",
            group(
                t("FROM THE ARCHIVE", "label"),
                row(
                    group(img(pic(671), 1.4), t("The courts where gym class happened", "caption")),
                    group(img(pic(672), 1.4), t("The quad benches · still there", "caption")),
                    group(img(pic(673), 1.4), t("Skate club, yearbook page 47", "caption")),
                ),
            ),
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("Lakeside Class of 2016", "h3")),
                        fitW(t("Ten-year reunion · October 10", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("THE COMMITTEE", "label")),
                        fitW(
                            linked("caption", [
                                "reunion@lakeside16.page",
                                "mailto:reunion@lakeside16.page",
                            ]),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("PHOTOS", "label")),
                        fitW(
                            linked("caption", [
                                "Submit for the wall",
                                "https://lakeside16.reunion.page/photos",
                            ]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(674, 1700, 1100), 0.3),
);

export const restaurantSite: ArtifactContent = web(
    "vellum",
    [
        section(
            "hero",
            group(
                siteNav(
                    "THE QUINCE",
                    navLink("Menu", "#menu"),
                    navLink("The room", "#room"),
                    navLink("Find us", "#find"),
                    navCta("Reserve", "https://thequince.com/reserve"),
                ),
                t("PORTLAND · EST. 2019", "label"),
                t("Dinner, from three farms away.", "h1"),
                t(
                    "A neighborhood restaurant with a short menu and long opinions. The farms are within forty miles; the menu changes when they do.",
                    "subtitle",
                ),
                button("Reserve a table", "https://thequince.com/reserve", { size: "lg" }),
                pin(
                    w(
                        24,
                        card(
                            t("TONIGHT", "label"),
                            t("Seatings at 6 and 8:30. The 6 is nearly spoken for.", "body"),
                        ),
                    ),
                    "end",
                    "end",
                    { dx: -28, dy: 108, z: 2 },
                ),
            ),
            {
                bleed: true,
                background: bgImage(pic(675, 1700, 1100), 0.58),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "menu",
            group(
                t("TONIGHT, ROUGHLY", "label"),
                pin(badge("The menu turned over Thursday"), "end", "start", {
                    dy: 2,
                    rotate: 3,
                    z: 2,
                }),
                dish("Charred leeks, romesco, hazelnut", "14"),
                dish("Squash agnolotti, brown butter, sage", "19"),
                dish("Half chicken, schmaltz potatoes, salsa verde", "29"),
                dish("Quince tarte tatin, crème fraîche", "12"),
                linked("caption", "The full menu changes weekly: ", [
                    "see this week's",
                    "https://thequince.com/menu",
                ]),
            ),
        ),
        section(
            "room",
            split(
                60,
                group(
                    t("THE ROOM", "label"),
                    t("Thirty-eight seats, one long bench.", "h2"),
                    t(
                        "Brick, candlelight, and a kitchen you can see into. The bar seats walk-ins; the bench is for groups who stay too long, which is the point of the bench.",
                        "body",
                    ),
                ),
                img(pic(676), 0.82),
            ),
        ),
        section(
            "farms",
            group(
                t("THE FARMS", "label"),
                t("Three farms, forty miles.", "h2"),
                t(
                    "Winterspring for greens, Broken Fence for pork and eggs, Quince Hill for the fruit that named the room. Their names are on the menu because they did most of the work.",
                    "body",
                ),
            ),
            { bleed: true, background: bgImage(pic(677, 1700, 1100), 0.55) },
        ),
        section(
            "find",
            group(
                t("FIND US", "label"),
                dish(
                    "Hours",
                    "Tue to Sun",
                    "5:30 to 10 · bar from 5 · closed Mondays for the farms run",
                ),
                dish(
                    "Where",
                    "1214 SE Ankeny",
                    "Two blocks off the bus mall · bike rack out front",
                ),
                dish(
                    "Contact",
                    "(503) 555-0177",
                    "Or hello@thequince.com · we answer between services",
                ),
            ),
        ),
        section(
            "chef",
            split(
                40,
                img(pic(678), 1.05),
                group(
                    t("THE KITCHEN", "label"),
                    t("June Aldana cooks like the farms are watching.", "h2"),
                    t(
                        "Twelve years on other people's lines, five on her own. The menu is short because the walk-in is honest: when the last delicata goes, so does the dish, and something better takes the chalkboard.",
                        "body",
                    ),
                ),
            ),
        ),
        section(
            "press",
            group(
                t("KIND WORDS", "label"),
                row(
                    testimonial(
                        "The rare farm-to-table room where the phrase isn't marketing. Order whatever has quince in it.",
                        "The Oregonian",
                        "Restaurant of the Year shortlist",
                        "https://i.pravatar.cc/240?img=53",
                    ),
                    testimonial(
                        "Went for a birthday, stayed till close, left with a jar of their chili oil and a farm's phone number.",
                        "A regular",
                        "five years running",
                        "https://i.pravatar.cc/240?img=20",
                    ),
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "events",
            group(
                t("BEYOND DINNER", "label"),
                dish(
                    "Farm dinners",
                    "monthly",
                    "One long table at Winterspring · dates on the letter",
                ),
                dish("The whole room", "up to 38", "Buyouts Tuesday and Wednesday · ask for Sam"),
                dish("The letter", "seasonal", "Menu changes and farm news · no spam, we promise"),
            ),
        ),
        section(
            "reserve",
            group(
                t("The bench is waiting.", "h2"),
                t("Walk-ins nightly at the bar; the dining room books two weeks out.", "subtitle"),
                button("Reserve a table", "https://thequince.com/reserve", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(679, 1700, 1100), 0.55) },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("The Quince", "h3")),
                        fitW(t("1214 SE Ankeny, Portland", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("HOURS", "label")),
                        fitW(t("Tue to Sun · 5:30 to 10 · bar from 5", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("RESERVE", "label")),
                        fitW(
                            linked(
                                "caption",
                                ["thequince.com/reserve", "https://thequince.com/reserve"],
                                " · ",
                                ["(503) 555-0177", "tel:+15035550177"],
                            ),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(680, 1700, 1100), 0.3),
);

export const rentalSite: ArtifactContent = web(
    "loft",
    [
        section(
            "hero",
            group(
                siteNav(
                    "THE CANAL FLAT",
                    navLink("The flat", "#flat"),
                    navLink("Guests say", "#reviews"),
                    navCta("Check dates", "#book"),
                ),
                t("PRINSENGRACHT 214B · AMSTERDAM", "label"),
                t("Two rooms over a quiet canal.", "h1"),
                t(
                    "A light-filled flat in the Nine Streets: steep stairs, wide windows, two bikes included, and hosts who leave you alone until you don't want them to.",
                    "subtitle",
                ),
                button("Check dates", "#book", { size: "lg" }),
                pin(badge("June has three open weeks"), "end", "start", {
                    dx: -28,
                    dy: 30,
                    rotate: -4,
                    z: 2,
                }),
            ),
            {
                bleed: true,
                background: bgImage(pic(681, 1700, 1100), 0.5),
                frame: { aspect: 16 / 8 },
            },
        ),
        section(
            "flat",
            group(
                t("THE FLAT", "label"),
                row(
                    group(
                        img(pic(682), 1.4),
                        t("The green door by the bikes; your key waits in the lockbox.", "caption"),
                    ),
                    group(
                        img(pic(683), 1.4),
                        t("The canal view that does the vacation's heavy lifting.", "caption"),
                    ),
                    group(
                        img(pic(684), 1.4),
                        t("The neighborhood runs on two wheels; so will you.", "caption"),
                    ),
                ),
            ),
        ),
        section(
            "amenities",
            group(
                t("WHAT'S INCLUDED", "label"),
                checks(
                    "Fast wifi that survives video calls",
                    "Two city bikes, helmets, and the lock code",
                    "A kitchen people actually cook in · moka pot included",
                    "A guest guide written like a friend wrote it, because one did",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "reviews",
            group(
                t("GUESTS SAY", "label"),
                row(
                    testimonial(
                        "The guide alone was worth the stay. We ate like locals from day one and the bakery warning was accurate.",
                        "Marta & Jon",
                        "Stayed in May",
                        "https://i.pravatar.cc/240?img=31",
                    ),
                    testimonial(
                        "Steepest stairs of my life and I'd book again tomorrow. The canal at 7am is a personality-changing experience.",
                        "Priyanka",
                        "Stayed in September",
                        "https://i.pravatar.cc/240?img=25",
                    ),
                ),
            ),
        ),
        section(
            "hosts",
            split(
                60,
                group(
                    t("YOUR HOSTS", "label"),
                    t("Iris & Daan, three floors down.", "h2"),
                    t(
                        "We've lived on this canal for eleven years and can book you a table, a boat, or a babysitter with one text. Otherwise, you won't hear from us.",
                        "body",
                    ),
                ),
                img(pic(685), 0.82),
            ),
        ),
        section(
            "neighborhood",
            group(
                t("OUT THE GREEN DOOR", "label"),
                dish(
                    "Café Zog",
                    "3 doors",
                    "Sit outside · order the apple cake · tell them the flat sent you",
                ),
                dish("The floating market", "4 bridges", "Saturday mornings · arrive before ten"),
                dish("The Nine Streets", "10 min walk", "The good kind of getting lost"),
            ),
        ),
        section(
            "seasons",
            group(
                t("WHEN TO COME", "label"),
                table(
                    "Season,The case for it\nSpring,Tulips · king's day chaos · book early\nSummer,Canal swimming · yes really · towels provided\nFall,Museum weather · our favorite\nWinter,Candlelit canals · the flat's fireplace era",
                ),
            ),
            { bleed: true, background: bgTone("tint") },
        ),
        section(
            "morning",
            group(
                t("The canal at 7am is the whole argument.", "h2"),
                t("Coffee on the sill, boats starting up, the city not quite awake.", "caption"),
            ),
            { bleed: true, background: bgImage(pic(686, 1700, 1100), 0.5) },
        ),
        section(
            "book",
            group(
                t("The canal is waiting.", "h2"),
                t(
                    "Three-night minimum · quiet hours after ten · the bakery sells out by nine.",
                    "subtitle",
                ),
                button("Check dates & book", "https://thecanalflat.nl/book", { size: "lg" }),
            ),
            { bleed: true, background: bgImage(pic(687, 1700, 1100), 0.5) },
        ),
        section(
            "footer",
            row(
                { justify: "between", align: "start" },
                fitW(
                    col(
                        fitW(t("The Canal Flat", "h3")),
                        fitW(t("Prinsengracht 214B, Amsterdam", "caption")),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("BOOK", "label")),
                        fitW(
                            linked("caption", [
                                "thecanalflat.nl/book",
                                "https://thecanalflat.nl/book",
                            ]),
                        ),
                    ),
                ),
                fitW(
                    col(
                        fitW(t("YOUR HOSTS", "label")),
                        fitW(
                            linked("caption", [
                                "iris@thecanalflat.nl",
                                "mailto:iris@thecanalflat.nl",
                            ]),
                        ),
                    ),
                ),
            ),
            { bleed: true, background: bgTone("contrast") },
        ),
    ],
    bgImage(pic(688, 1700, 1100), 0.3),
);

const BODIES: Record<string, ArtifactContent> = {
    "startup-pitch": startupPitch,
    "sales-deck": salesDeck,
    "series-a": seriesA,
    "product-demo": productDemo,
    "company-overview": companyOverview,
    "gtm-plan": gtmPlan,
    "annual-report": annualReport,
    "case-study": caseStudy,
    "research-report": researchReport,
    "market-analysis": marketAnalysis,
    qbr,
    "trends-report": trendsReport,
    "product-launch": productLaunch,
    "landing-page": landingPage,
    "event-page": eventPage,
    "waitlist-page": waitlistPage,
    "agency-site": agencySite,
    newsletter,
    "project-proposal": projectProposal,
    "investor-update": investorUpdate,
    "business-proposal": businessProposal,
    "board-deck": boardDeck,
    "sponsorship-deck": sponsorshipDeck,
    sow,
    resume,
    portfolio,
    "personal-site": personalSite,
    "cover-letter": coverLetter,
    "event-invite": eventInvite,
    "photo-essay": photoEssay,
    "restaurant-menu": restaurantMenu,
    "travel-itinerary": travelItinerary,
    "real-estate-listing": realEstateListing,
    "guest-guide": guestGuide,
    "recipe-collection": recipeCollection,
    "event-program": eventProgram,
    "exec-summary": execSummary,
    "product-sheet": productSheet,
    "fact-sheet": factSheet,
    "partnership-pitch": partnershipPitch,
    "about-page": aboutPage,
    "demo-page": demoPage,
    "wall-of-love": wallOfLove,
    "solution-page": solutionPage,
    "compare-page": comparePage,
    "campaign-pitch": campaignPitch,
    "brand-guidelines": brandGuidelines,
    "announcement-keynote": announcementKeynote,
    "launch-briefing": launchBriefing,
    "release-notes": releaseNotes,
    "press-kit": pressKit,
    "launch-playbook": launchPlaybook,
    "messaging-guide": messagingGuide,
    "pricing-page": pricingPage,
    "kickoff-deck": kickoffDeck,
    "capabilities-deck": capabilitiesDeck,
    "workshop-deck": workshopDeck,
    "client-status": clientStatus,
    "proposal-site": proposalSite,
    "project-hub": projectHub,
    "case-study-site": caseStudySite,
    "services-page": servicesPage,
    "all-hands": allHandsDeck,
    "growth-review": growthReview,
    "research-readout": researchReadout,
    "annual-plan": annualPlan,
    "impact-site": impactSite,
    "research-site": researchSite,
    "changelog-site": changelogSite,
    "open-metrics": openMetrics,
    "status-page": statusPage,
    "conference-talk": conferenceTalk,
    "portfolio-deck": portfolioDeck,
    "teaching-deck": teachingDeck,
    "year-in-review": yearInReview,
    "side-project-pitch": sideProjectPitch,
    "design-case-study": designCaseStudy,
    "speaker-kit": speakerKit,
    "link-hub": linkHub,
    "speaking-page": speakingPage,
    "app-site": appSite,
    "celebration-slideshow": celebrationSlideshow,
    "trivia-night": triviaNight,
    "travel-recap": travelRecap,
    "birthday-toast": birthdayToast,
    "book-club": bookClub,
    "party-invite": partyInvite,
    "reunion-site": reunionSite,
    "restaurant-site": restaurantSite,
    "rental-site": rentalSite,
};

export function templateBody(id: string): ArtifactContent | null {
    return BODIES[id] ?? null;
}

// index + body, the shape the client renders from
export function template(id: string): Template | null {
    const entry = TEMPLATE_INDEX.find((t) => t.id === id);
    const content = templateBody(id);
    return entry && content ? { ...entry, content } : null;
}
