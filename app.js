// Speech recognition isn't yet widely supported – we can use it in Chrome
// but we need a 'vendor prefix' (Webkit used to be the engine inside Chrome)
var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
var SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList;

var $viewport = $( '.viewport' );
var $debug = $( '.debug' );

// break apart words using Blast (http://julian.com/research/blast/)
$viewport.blast({ delimiter: 'word' });

var THRESHOLD = 30; // maximum Levenshtein distance

// this function will use some fuzzy Levenshtein matching to guess
// how far we are through a piece of text. If the current page
// contains 'the quick brown fox jumps over the lazy dog', and the
// speech recognition transcript is 'the quack brown fix', the result
// will be 4 (i.e. the first four words more or less match)
function evaluateProgress ( actualWords, guessedWords, bankedProgress ) {
	var closestWordCount;
	var closestScore = Infinity;

	for ( i = bankedProgress + 1; i <= actualWords.length; i += 1 ) {
		var score = Levenshtein.get( actualWords.slice( bankedProgress, i ).filter( Boolean ).join( ' ' ), guessedWords );

		if ( score < closestScore ) {
			closestWordCount = i;
			closestScore = score;
		}
	}

	if ( closestScore > THRESHOLD ) {
		return null;
	}

	return closestWordCount;
}

var $start = $( '#start' );
var currentPage = 1;
var progress = 0; // number of words that have been read on the current page
var bankedProgress = 0; // number of words that are 'banked' – i.e. we're no longer listening for them

// During speech recognition, we get interim results – quicker, but less accurate.
// This allows us to figure out what the user has read before the browser decides
// they've finished reading it. Unfortunately, due to a bug in Chrome for Android
// (https://bugs.chromium.org/p/chromium/issues/detail?id=457068), we can't rely
// on `result.isFinal` to distinguish between final and interim results. On Desktop
// Chrome, we *can* rely on it. As soon as we get a result where `result.isFinal`
// is `false`, we know that it's reliable. More on this later...
var isFinalIsReliable = false;

$start.on( 'click touchstart', function ( event ) {
	event.preventDefault(); // otherwise the touchstart causes a secondary click on touchscreens

	$start.addClass( 'active' ); // hides the 'start reading' button

	// https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
	var recognition = new SpeechRecognition();
	recognition.lang = 'en-US';
	recognition.continuous = true;
	recognition.interimResults = true;

	function gotoPage ( pageNum ) {
		currentPage = pageNum;

		var $section = $( '[data-page=' + pageNum + ']' );
		$viewport.css( 'transform', 'translate(-' + $section.position().left + 'px,0)' );

		if ( $section.hasClass( 'final' ) ) {
			recognition.stop();

			// Reset everything
			$( '.done' ).removeClass( 'done' );
			currentPage = 1;

			return;
		}

		var $words = $section.find( '.text .blast' );
		var words = [].map.call( $words, function ( word ) {
			var match = /\w+/.exec( word.textContent );
			return match ? match[0].toLowerCase() : null;
		});

		var lastTranscript = '';
		var lastResultWasFinal = true;

		recognition.onresult = function ( event ) {
			var result = event.results[ event.resultIndex ];
			var transcript = result[0].transcript;

			// See note above re Android Chrome bug
			if ( !result.isFinal ) isFinalIsReliable = true;

			var wasFinal = isFinalIsReliable ?
				lastResultWasFinal :
				!lastTranscript || ( transcript.length < lastTranscript.length );

			// if `wasFinal` is true, it means the current transcript won't
			// contain the words that have been identified so far, so we 'bank' them
			if ( wasFinal ) bankedProgress = progress;

			var newProgress = evaluateProgress( words, transcript, bankedProgress );

			// if the user has read some more of the text, we gray it out. If
			// they've read the whole page, we go to the next one
			if ( newProgress > progress ) {
				progress = newProgress;
				$words.slice( 0, progress ).addClass( 'done' ); // grays out text

				if ( progress === words.length ) {
					// reset
					progress = 0;
					bankedProgress = 0;

					gotoPage( pageNum + 1 );
				}
			}

			lastResultWasFinal = result.isFinal;
			lastTranscript = transcript;
		};
	}

	recognition.onend = function () {
		bankedProgress = progress;
		$start.removeClass( 'active' );
	};

	recognition.onnomatch = function () {
		// TODO do we need to do anything in this situation?
	};

	recognition.onerror = function ( err ) {
		$debug.text( 'error: ' + err.message );
	};

	gotoPage( currentPage );
	recognition.start();
});
