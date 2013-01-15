/** Developer settings and other provisions.
 *
 * An empty copy of this file should be used for production releases.
 */

/* Copyright 2012 SpiderOak, Inc.

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

/** SO_DEBUGGING has string parameters for debugging operation.
 *
 * Only the "basic" setting should be checked in.
 *
 * Include any non-empty string for general debugging messages.
 * ":verbose:" - additonal, UI-visible messages status messages
 * ":repl:" - pop up a read/eval/print loop, when repl activation entered (see
 *            "repl_key", below)
 * ":content_urls:" - log content urls as they're traversed
 * ":test_keychain_trivial:" - elementary keychain plugin test
 */
SO_DEBUGGING = ":basic: :content_urls: :repl: -test_keychain_trivial- -verbose-";

if (SO_DEBUGGING.match(/:repl:/)) {
    /** Simple javascript read/eval/print loop, for poking and prodding.
     *
     * Runs in a javascript prompt().
     */
    function repl() {
        var repl_expr = "", repl_result = "", repl_error;
        while (repl_expr = prompt(repl_result + "" || "", "")) {
            try {
                repl_result = eval(repl_expr);
            } catch(e) {
                repl_result = "! " + e;
            }
        }
    }

    /** Launch repl when cue is noticed
     *
     * See cue variable for the cue phrase.
     *
     * We retain only the last character of input.
     */
    replSentinel = function () {
        // Only upcase alphabetics - they map to lower case on the device!
        var cue = "REPLPLEASE",
            cue_at = 0;
        return {
            poll: function(repl_poll_event) {
                var currkey = repl_poll_event.keyCode;
                if (cue.charCodeAt(cue_at) === currkey) {
                    cue_at += 1;
                    if (cue.length === cue_at) {
                        //console.log("repl cue satisfied");
                        repl();
                    } else {
                        //console.log("repl sentinel increment to: " + cue_at);
                        ;
                    }
                } else {
                    cue_at = 0;
                }
            },
        }
    }()
    $(document).bind("keydown", replSentinel.poll);
}
