<?php
class Af_RedditImgur extends Plugin {
	private $host;

	function about() {
		return array(1.0,
			"Inline images (and other content) in Reddit RSS feeds",
			"fox");
	}

	function flags() {
		return array("needs_curl" => true);
	}

	function init($host) {
		$this->host = $host;

		$host->add_hook($host::HOOK_ARTICLE_FILTER, $this);
		$host->add_hook($host::HOOK_PREFS_TAB, $this);
	}

	function hook_prefs_tab($args) {
		if ($args != "prefFeeds") return;

		print "<div dojoType=\"dijit.layout.AccordionPane\" title=\"".__('Reddit content settings (af_redditimgur)')."\">";

		$enable_readability = $this->host->get($this, "enable_readability");
		$enable_content_dupcheck = $this->host->get($this, "enable_content_dupcheck");

		print "<form dojoType=\"dijit.form.Form\">";

		print "<script type=\"dojo/method\" event=\"onSubmit\" args=\"evt\">
			evt.preventDefault();
			if (this.validate()) {
				console.log(dojo.objectToQuery(this.getValues()));
				new Ajax.Request('backend.php', {
					parameters: dojo.objectToQuery(this.getValues()),
					onComplete: function(transport) {
						notify_info(transport.responseText);
					}
				});
				//this.reset();
			}
			</script>";

		print_hidden("op", "pluginhandler");
		print_hidden("method", "save");
		print_hidden("plugin", "af_redditimgur");

		print "<p>" . __("Uses Readability (full-text-rss) implementation by <a target='_blank' href='https://bitbucket.org/fivefilters/'>FiveFilters.org</a>");
		print "<p/>";

		print_checkbox("enable_readability", $enable_readability);
		print "&nbsp;<label for=\"enable_readability\">" . __("Extract missing content using Readability") . "</label>";

		print "<br/>";

		print_checkbox("enable_content_dupcheck", $enable_content_dupcheck);
		print "&nbsp;<label for=\"enable_content_dupcheck\">" . __("Enable additional duplicate checking") . "</label>";
		print "<p>"; print_button("submit", __("Save"));
		print "</form>";

		print "</div>";
	}

	function save() {
		$enable_readability = checkbox_to_sql_bool($_POST["enable_readability"]) == "true";
		$enable_content_dupcheck = checkbox_to_sql_bool($_POST["enable_content_dupcheck"]) == "true";

		$this->host->set($this, "enable_readability", $enable_readability, false);
		$this->host->set($this, "enable_content_dupcheck", $enable_content_dupcheck);

		echo __("Configuration saved");
	}

	/**
	 * @SuppressWarnings(PHPMD.UnusedFormalParameter)
	 */
	private function inline_stuff($article, &$doc, $xpath, $debug = false) {

		$entries = $xpath->query('(//a[@href]|//img[@src])');

		$found = false;

		foreach ($entries as $entry) {
			if ($entry->hasAttribute("href")) {

				_debug("processing href: " . $entry->getAttribute("href"), $debug);

				$matches = array();

				if (preg_match("/^https?:\/\/twitter.com\/(.*?)\/status\/(.*)/", $entry->getAttribute("href"), $matches)) {
					_debug("handling as twitter: " . $matches[1] . " " . $matches[2], $debug);

					$oembed_result = fetch_file_contents("https://publish.twitter.com/oembed?url=" . urlencode($entry->getAttribute("href")));

					if ($oembed_result) {
						$oembed_result = json_decode($oembed_result, true);

						if ($oembed_result && isset($oembed_result["html"])) {

							$tmp = new DOMDocument();
							if ($tmp->loadHTML('<?xml encoding="utf-8" ?>' . $oembed_result["html"])) {
								$p = $doc->createElement("p");

								$p->appendChild($doc->importNode(
									$tmp->getElementsByTagName("blockquote")->item(0), TRUE));

								$br = $doc->createElement('br');
								$entry->parentNode->insertBefore($p, $entry);
								$entry->parentNode->insertBefore($br, $entry);

								$found = 1;
							}
						}
					}
				}

				if (!$found && preg_match("/\.gfycat.com\/([a-z]+)?(\.[a-z]+)$/i", $entry->getAttribute("href"), $matches)) {
					$entry->setAttribute("href", "http://www.gfycat.com/".$matches[1]);
				}

				if (!$found && preg_match("/https?:\/\/(www\.)?gfycat.com\/([a-z]+)$/i", $entry->getAttribute("href"), $matches)) {

					_debug("Handling as Gfycat", $debug);

					$tmp = fetch_file_contents($entry->getAttribute("href"));

					if ($tmp) {
						$tmpdoc = new DOMDocument();

						if (@$tmpdoc->loadHTML($tmp)) {
							$tmpxpath = new DOMXPath($tmpdoc);

							$source_node = $tmpxpath->query("//video[contains(@class,'share-video')]//source[contains(@src, '.mp4')]")->item(0);
							$poster_node = $tmpxpath->query("//video[contains(@class,'share-video') and @poster]")->item(0);

							if ($source_node && $poster_node) {
								$source_stream = $source_node->getAttribute("src");
								$poster_url = $poster_node->getAttribute("poster");

								$this->handle_as_video($doc, $entry, $source_stream, $poster_url);
								$found = 1;
							}
						}
					}
				}

				if (!$found && preg_match("/https?:\/\/(www\.)?streamable.com\//i", $entry->getAttribute("href"))) {

					_debug("Handling as Streamable", $debug);

					$tmp = fetch_file_contents($entry->getAttribute("href"));

					if ($tmp) {
						$tmpdoc = new DOMDocument();

						if (@$tmpdoc->loadHTML($tmp)) {
							$tmpxpath = new DOMXPath($tmpdoc);

							$source_node = $tmpxpath->query("//video[contains(@class,'video-player-tag')]//source[contains(@src, '.mp4')]")->item(0);
							$poster_node = $tmpxpath->query("//video[contains(@class,'video-player-tag') and @poster]")->item(0);

							if ($source_node && $poster_node) {
								$source_stream = $source_node->getAttribute("src");
								$poster_url = $poster_node->getAttribute("poster");

								$this->handle_as_video($doc, $entry, $source_stream, $poster_url);
								$found = 1;
							}
						}
					}
				}

				// imgur .gif -> .gifv
				if (!$found && preg_match("/i\.imgur\.com\/(.*?)\.gif$/i", $entry->getAttribute("href"))) {
					_debug("Handling as imgur gif (->gifv)", $debug);

					$entry->setAttribute("href",
						str_replace(".gif", ".gifv", $entry->getAttribute("href")));
				}

				if (!$found && preg_match("/\.(gifv|mp4)$/i", $entry->getAttribute("href"))) {
					_debug("Handling as imgur gifv", $debug);

					$source_stream = str_replace(".gifv", ".mp4", $entry->getAttribute("href"));

					if (strpos($source_stream, "imgur.com") !== FALSE)
						$poster_url = str_replace(".mp4", "h.jpg", $source_stream);

					$this->handle_as_video($doc, $entry, $source_stream, $poster_url, $debug);

					$found = true;
				}

				$matches = array();
				if (!$found && preg_match("/youtube\.com\/v\/([\w-]+)/", $entry->getAttribute("href"), $matches) ||
					preg_match("/youtube\.com\/.*?[\&\?]v=([\w-]+)/", $entry->getAttribute("href"), $matches) ||
					preg_match("/youtube\.com\/watch\?v=([\w-]+)/", $entry->getAttribute("href"), $matches) ||
					preg_match("/\/\/youtu.be\/([\w-]+)/", $entry->getAttribute("href"), $matches)) {

					$vid_id = $matches[1];

					_debug("Handling as youtube: $vid_id", $debug);

					$iframe = $doc->createElement("iframe");
					$iframe->setAttribute("class", "youtube-player");
					$iframe->setAttribute("type", "text/html");
					$iframe->setAttribute("width", "640");
					$iframe->setAttribute("height", "385");
					$iframe->setAttribute("src", "https://www.youtube.com/embed/$vid_id");
					$iframe->setAttribute("allowfullscreen", "1");
					$iframe->setAttribute("frameborder", "0");

					$br = $doc->createElement('br');
					$entry->parentNode->insertBefore($iframe, $entry);
					$entry->parentNode->insertBefore($br, $entry);

					$found = true;
				}

				if (!$found && preg_match("/\.(jpg|jpeg|gif|png)(\?[0-9][0-9]*)?$/i", $entry->getAttribute("href")) ||
					mb_strpos($entry->getAttribute("href"), "i.reddituploads.com") !== FALSE ||
					mb_strpos($this->get_content_type($entry->getAttribute("href")), "image/") !== FALSE) {

					_debug("Handling as a picture", $debug);

					$img = $doc->createElement('img');
					$img->setAttribute("src", $entry->getAttribute("href"));

					$br = $doc->createElement('br');
					$entry->parentNode->insertBefore($img, $entry);
					$entry->parentNode->insertBefore($br, $entry);

					$found = true;
				}

				// linked albums & pages

				if (!$found && preg_match("/^https?:\/\/(m\.)?imgur.com\/([^\.\/]+$)/", $entry->getAttribute("href"), $matches) ||
					preg_match("/^https?:\/\/(m\.)?imgur.com\/(a|album|gallery)\/[^\.]+$/", $entry->getAttribute("href"), $matches)) {

					_debug("Handling as an imgur page/album/gallery", $debug);

					$album_content = fetch_file_contents($entry->getAttribute("href"),
						false, false, false, false, 10);

					if ($album_content) {
						$adoc = new DOMDocument();

						if (@$adoc->loadHTML($album_content)) {
							$axpath = new DOMXPath($adoc);

							$aentries = $axpath->query("(//div[@class='post-image']/img[@src] | //a[@class='zoom']/img[@src] | //div[@class='video-elements']/source)");
							$urls = [];

							foreach ($aentries as $aentry) {

								$url = $aentry->getAttribute("src");

								if (!in_array($url, $urls)) {

									if ($aentry->tagName == "img") {

										$img = $doc->createElement('img');
										$img->setAttribute("src", $url);
										$entry->parentNode->insertBefore($doc->createElement('br'), $entry);

										$br = $doc->createElement('br');

										$entry->parentNode->insertBefore($img, $entry);
										$entry->parentNode->insertBefore($br, $entry);
									} else if ($aentry->tagName == "source") {

										if (strpos($url, "imgur.com") !== FALSE)
											$poster_url = str_replace(".mp4", "h.jpg", $url);
										else
											$poster_url = "";

										$this->handle_as_video($doc, $entry, $url, $poster_url);

									}

									array_push($urls, $url);

									$found = true;
								}

							}

							if ($debug) print_r($urls);
						}
					}
				}

				// wtf is this even
				if (!$found && preg_match("/^https?:\/\/gyazo\.com\/([^\.\/]+$)/", $entry->getAttribute("href"), $matches)) {
					$img_id = $matches[1];

					_debug("handling as gyazo: $img_id", $debug);

					$img = $doc->createElement('img');
					$img->setAttribute("src", "https://i.gyazo.com/$img_id.jpg");

					$br = $doc->createElement('br');
					$entry->parentNode->insertBefore($img, $entry);
					$entry->parentNode->insertBefore($br, $entry);

					$found = true;
				}
			}

			// remove tiny thumbnails
			if ($entry->hasAttribute("src")) {
				if ($entry->parentNode && $entry->parentNode->parentNode) {
					$entry->parentNode->parentNode->removeChild($entry->parentNode);
				}
			}
		}

		return $found;
	}

	function hook_article_filter($article) {

		if (strpos($article["link"], "reddit.com/r/") !== FALSE) {
			$doc = new DOMDocument();
			@$doc->loadHTML($article["content"]);
			$xpath = new DOMXPath($doc);

			$content_link = $xpath->query("(//a[contains(., '[link]')])")->item(0);

			if ($this->host->get($this, "enable_content_dupcheck")) {

				if ($content_link) {
					$content_href = db_escape_string($content_link->getAttribute("href"));
					$entry_guid = db_escape_string($article["guid_hashed"]);
					$owner_uid = $article["owner_uid"];

					if (DB_TYPE == "pgsql") {
						$interval_qpart = "date_entered < NOW() - INTERVAL '1 day'";
					} else {
						$interval_qpart = "date_entered < DATE_SUB(NOW(), INTERVAL 1 DAY)";
					}

					$result = db_query("SELECT COUNT(id) AS cid
						FROM ttrss_entries, ttrss_user_entries WHERE
							ref_id = id AND
							$interval_qpart AND
							guid != '$entry_guid' AND
							owner_uid = '$owner_uid' AND
							content LIKE '%href=\"$content_href\">[link]%'");

					if ($result) {
						$num_found = db_fetch_result($result, 0, "cid");

						if ($num_found > 0) $article["force_catchup"] = true;
					}
				}
			}

			$found = $this->inline_stuff($article, $doc, $xpath);

			$node = $doc->getElementsByTagName('body')->item(0);

			if ($node && $found) {
				$article["content"] = $doc->saveXML($node);
			} else if ($content_link) {
				$article = $this->readability($article, $content_link->getAttribute("href"), $doc, $xpath);
			}
		}

		return $article;
	}

	function api_version() {
		return 2;
	}

	private function handle_as_video($doc, $entry, $source_stream, $poster_url = false, $debug = false) {

		_debug("handle_as_video: $source_stream", $debug);

		$video = $doc->createElement('video');
		$video->setAttribute("autoplay", "1");
		$video->setAttribute("controls", "1");
		$video->setAttribute("loop", "1");

		if ($poster_url) $video->setAttribute("poster", $poster_url);

		$source = $doc->createElement('source');
		$source->setAttribute("src", $source_stream);
		$source->setAttribute("type", "video/mp4");

		$video->appendChild($source);

		$br = $doc->createElement('br');
		$entry->parentNode->insertBefore($video, $entry);
		$entry->parentNode->insertBefore($br, $entry);

		$img = $doc->createElement('img');
		$img->setAttribute("src",
			"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs%3D");

		$entry->parentNode->insertBefore($img, $entry);
	}

	function testurl() {
		$url = htmlspecialchars($_REQUEST["url"]);

		header("Content-type: text/plain");

		print "URL: $url\n";

		$doc = new DOMDocument();
		@$doc->loadHTML("<html><body><a href=\"$url\">[link]</a></body>");
		$xpath = new DOMXPath($doc);

		$found = $this->inline_stuff([], $doc, $xpath, true);

		print "Inline result: $found\n";

		if (!$found) {
			print "\nReadability result:\n";

			$article = $this->readability([], $url, $doc, $xpath, true);

			print_r($article);
		} else {
			print "\nResulting HTML:\n";

			print $doc->saveHTML();
		}
	}

	private function get_content_type($url, $useragent = SELF_USER_AGENT) {
		$content_type = false;

		if (function_exists("curl_init") && !defined("NO_CURL")) {
			$ch = curl_init($url);
			curl_setopt($ch, CURLOPT_TIMEOUT, 5);
			curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
			curl_setopt($ch, CURLOPT_HEADER, true);
			curl_setopt($ch, CURLOPT_NOBODY, true);
			curl_setopt($ch, CURLOPT_FOLLOWLOCATION, !ini_get("open_basedir"));
			curl_setopt($ch, CURLOPT_USERAGENT, $useragent);

			@curl_exec($ch);
			$content_type = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
		}

		return $content_type;
	}

	/**
	 * @SuppressWarnings(PHPMD.UnusedFormalParameter)
	 */
	private function readability($article, $url, $doc, $xpath, $debug = false) {

		if (!defined('NO_CURL') && function_exists("curl_init") && $this->host->get($this, "enable_readability") &&
			mb_strlen(strip_tags($article["content"])) <= 150) {

			if (!class_exists("Readability")) require_once(dirname(dirname(__DIR__)). "/lib/readability/Readability.php");

			if ($url &&
				strpos($url, "twitter.com") === FALSE &&
				strpos($url, "youtube.com") === FALSE &&
				strpos($url, "reddit.com") === FALSE) {

				/* link may lead to a huge video file or whatever, we need to check content type before trying to
				parse it which p much requires curl */

				$useragent_compat = "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; WOW64; Trident/6.0)";

				$content_type = $this->get_content_type($url, $useragent_compat);

				if ($content_type && strpos($content_type, "text/html") !== FALSE) {

					$tmp = fetch_file_contents(array("url" => $url,
						"useragent" => $useragent_compat));

					if ($debug) _debug("tmplen: " . mb_strlen($tmp));

					if ($tmp && mb_strlen($tmp) < 1024 * 500) {

						$r = new Readability($tmp, $url);

						if ($r->init()) {

							$tmpxpath = new DOMXPath($r->dom);

							$entries = $tmpxpath->query('(//a[@href]|//img[@src])');

							foreach ($entries as $entry) {
								if ($entry->hasAttribute("href")) {
									$entry->setAttribute("href",
										rewrite_relative_url($url, $entry->getAttribute("href")));

								}

								if ($entry->hasAttribute("src")) {
									$entry->setAttribute("src",
										rewrite_relative_url($url, $entry->getAttribute("src")));

								}

							}

							$article["content"] = $r->articleContent->innerHTML . "<hr/>" . $article["content"];
						}
					}
				}
			}
		}

		return $article;
	}
}
