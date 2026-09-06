package vndb

// URL recipes for external links, taken from vndb's lib/VNDB/ExtLinks.pm
// (AGPL). A link is stored as a site name and a bare value -- ("steam",
// "616620") -- because vndb builds the address only when it renders a page, so
// the recipes have to live on our side too.
//
// Nine sites are written upstream as subroutines rather than templates,
// because their address can depend on an affiliate code and on extlinks.data.
// We have neither: no affiliate codes, and the dump exports only (site, value).
// With both empty every one of them reduces to a fixed template, which is what
// is recorded here. Only itch still needs code, since its value holds two path
// segments -- see buildExtLink.
//
// entities lists the id prefixes a site may appear on.

type extlinkSite struct {
	label    string
	format   string
	entities string
}

var extlinkSites = map[string]extlinkSite{
	"afdian":         {label: "Afdian", format: "https://afdian.com/a/%s", entities: "ps"},
	"anidb":          {label: "AniDB", format: "https://anidb.net/cr%d", entities: "s"},
	"animateg":       {label: "Animate Games", format: "https://www.animategames.jp/home/detail/%d", entities: "r"},
	"anison":         {label: "Anison", format: "http://anison.info/data/person/%d.html", entities: "s"},
	"appstore":       {label: "App Store", format: "https://apps.apple.com/app/id%d", entities: "r"},
	"bgmtv":          {label: "Bangumi", format: "https://bgm.tv/person/%d", entities: "s"},
	"bilibili":       {label: "Bilibili", format: "https://space.bilibili.com/%d", entities: "ps"},
	"boosty":         {label: "Boosty", format: "https://boosty.to/%s", entities: "ps"},
	"booth":          {label: "BOOTH", format: "https://booth.pm/en/items/%d", entities: "r"},
	"booth_pub":      {label: "BOOTH", format: "https://%s.booth.pm/", entities: "ps"},
	"bsky":           {label: "Bluesky", format: "https://bsky.app/profile/%s", entities: "ps"},
	"cien":           {label: "Ci-en", format: "https://ci-en.dlsite.com/creator/%d", entities: "ps"},
	"denpa":          {label: "Denpasoft", format: "https://denpasoft.com/product/%s/", entities: "r"},
	"deviantar":      {label: "DeviantArt", format: "https://www.deviantart.com/%s", entities: "s"},
	"digiket":        {label: "Digiket", format: "https://www.digiket.com/work/show/_data/ID=ITM%07d/", entities: "r"},
	"discogs":        {label: "Discogs", format: "https://www.discogs.com/artist/%d", entities: "s"},
	"dlsite":         {label: "DLsite", format: "https://www.dlsite.com/home/work/=/product_id/%s.html", entities: "r"},
	"dlsiteen":       {label: "DLsite (eng)", format: "https://www.dlsite.com/eng/work/=/product_id/%s.html", entities: "r"},
	"dmm":            {label: "DMM", format: "https://%s", entities: "r"},
	"egs":            {label: "ErogameScape", format: "https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=%d", entities: "r"},
	"egs_creator":    {label: "ErogameScape", format: "https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/creater.php?creater=%d", entities: "s"},
	"encubed":        {label: "Novelnews", format: "http://novelnews.net/tag/%s/", entities: "v"},
	"erotrail":       {label: "ErogeTrailers", format: "http://erogetrailers.com/soft/%d", entities: "r"},
	"facebook":       {label: "Facebook", format: "https://www.facebook.com/%s", entities: "ps"},
	"fakku":          {label: "Fakku", format: "https://www.fakku.net/games/%s", entities: "r"},
	"fanbox":         {label: "Fanbox", format: "https://%s.fanbox.cc/", entities: "ps"},
	"fantia":         {label: "Fantia", format: "https://fantia.jp/fanclubs/%d", entities: "ps"},
	"freegame":       {label: "Freegame Mugen", format: "https://freegame-mugen.jp/%s.html", entities: "r"},
	"freem":          {label: "Freem!", format: "https://www.freem.ne.jp/win/game/%d", entities: "r"},
	"gamefaqs_comp":  {label: "GameFAQs", format: "https://gamefaqs.gamespot.com/company/%d-", entities: "p"},
	"gamejolt":       {label: "Game Jolt", format: "https://gamejolt.com/games/vn/%d", entities: "r"},
	"getchu":         {label: "Getchu", format: "http://www.getchu.com/soft.phtml?id=%d", entities: "r"},
	"getchudl":       {label: "DL.Getchu", format: "http://dl.getchu.com/i/item%d", entities: "r"},
	"gog":            {label: "GOG", format: "https://www.gog.com/en/game/%s", entities: "r"},
	"googplay":       {label: "Google Play", format: "https://play.google.com/store/apps/details?id=%s", entities: "r"},
	"gyutto":         {label: "Gyutto", format: "https://gyutto.com/i/item%d", entities: "r"},
	"imdb":           {label: "IMDb", format: "https://www.imdb.com/name/nm%07d", entities: "s"},
	"instagram":      {label: "Instagram", format: "https://www.instagram.com/%s/", entities: "ps"},
	"itch":           {label: "Itch.io", format: "https://%s.itch.io/%s", entities: "r"},
	"itch_dev":       {label: "Itch.io", format: "https://%s.itch.io/", entities: "ps"},
	"jastusa":        {label: "JAST USA", format: "https://jastusa.com/games/%s/vndb", entities: "r"},
	"jlist":          {label: "J-List", format: "https://jlist.com/shop/product/%s", entities: "r"},
	"johren":         {label: "Johren", format: "https://www.johren.games/games/download/%s/", entities: "r"},
	"kagura":         {label: "Kagura Games", format: "https://www.kaguragames.com/product/%s/", entities: "r"},
	"kofi":           {label: "Ko-fi", format: "https://ko-fi.com/%s", entities: "s"},
	"mbrainz":        {label: "MusicBrainz", format: "https://musicbrainz.org/artist/%s", entities: "s"},
	"melon":          {label: "Melonbooks.com", format: "https://www.melonbooks.com/index.php?main_page=product_info&products_id=IT%010d", entities: "r"},
	"melonjp":        {label: "Melonbooks.co.jp", format: "https://www.melonbooks.co.jp/detail/detail.php?product_id=%d", entities: "r"},
	"mg":             {label: "MangaGamer", format: "https://www.mangagamer.com/r18/detail.php?product_code=%d", entities: "r"},
	"mobygames":      {label: "MobyGames", format: "https://www.mobygames.com/person/%d", entities: "ps"},
	"mobygames_comp": {label: "MobyGames", format: "https://www.mobygames.com/company/%d", entities: "ps"},
	"nijie":          {label: "Nijie", format: "https://nijie.info/members.php?id=%d", entities: "ps"},
	"nintendo":       {label: "Nintendo", format: "https://www.nintendo.com/store/products/%s/", entities: "r"},
	"nintendo_hk":    {label: "Nintendo (HK)", format: "https://store.nintendo.com.hk/%d", entities: "r"},
	"nintendo_jp":    {label: "Nintendo (JP)", format: "https://store-jp.nintendo.com/item/software/D%d", entities: "r"},
	"novelgam":       {label: "NovelGame", format: "https://novelgame.jp/games/show/%d", entities: "r"},
	"nutaku":         {label: "Nutaku", format: "https://www.nutaku.net/games/%s/", entities: "r"},
	"patreon":        {label: "Patreon", format: "https://www.patreon.com/%s", entities: "prs"},
	"patreonp":       {label: "Patreon post", format: "https://www.patreon.com/posts/%d", entities: "r"},
	"pixiv":          {label: "Pixiv", format: "https://www.pixiv.net/member.php?id=%d", entities: "ps"},
	"playasia":       {label: "PlayAsia", format: "https://www.play-asia.com/13/70%s", entities: "r"},
	"playstation_eu": {label: "PlayStation Store (EU)", format: "https://store.playstation.com/en-gb/product/%s", entities: "r"},
	"playstation_hk": {label: "PlayStation Store (HK)", format: "https://store.playstation.com/en-hk/product/%s", entities: "r"},
	"playstation_jp": {label: "PlayStation Store (JP)", format: "https://store.playstation.com/ja-jp/product/%s", entities: "r"},
	"playstation_na": {label: "PlayStation Store (NA)", format: "https://store.playstation.com/en-us/product/%s", entities: "r"},
	"renai":          {label: "Renai.us", format: "https://renai.us/game/%s", entities: "v"},
	"scloud":         {label: "SoundCloud", format: "https://soundcloud.com/%s", entities: "ps"},
	"steam":          {label: "Steam", format: "https://store.steampowered.com/app/%d/", entities: "r"},
	"steam_curator":  {label: "Steam Curator", format: "https://store.steampowered.com/curator/%d", entities: "ps"},
	"substar":        {label: "SubscribeStar", format: "https://subscribestar.%s", entities: "prs"},
	"toranoana":      {label: "Toranoana", format: "https://ec.toranoana.shop/tora/ec/item/%012d/", entities: "r"},
	"tumblr":         {label: "Tumblr", format: "https://%s.tumblr.com/", entities: "ps"},
	"twitter":        {label: "Xitter", format: "https://x.com/%s", entities: "ps"},
	"vgmdb":          {label: "VGMdb", format: "https://vgmdb.net/artist/%d", entities: "s"},
	"vgmdb_org":      {label: "VGMdb org", format: "https://vgmdb.net/org/%d", entities: "s"},
	"vk":             {label: "VK", format: "https://vk.com/%s", entities: "ps"},
	"vndb":           {label: "VNDB user", format: "https://vndb.org/%s", entities: "s"},
	"website":        {label: "Official website", format: "%s", entities: "prs"},
	"weibo":          {label: "Weibo", format: "https://weibo.com/u/%d", entities: "ps"},
	"wikidata":       {label: "Wikidata", format: "https://www.wikidata.org/wiki/Q%d", entities: "psv"},
	"wp":             {label: "Wikipedia", format: "https://en.wikipedia.org/wiki/%s", entities: "psv"},
	"youtube":        {label: "Youtube", format: "https://www.youtube.com/@%s", entities: "ps"},
}
