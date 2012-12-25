/** Various functional testing utilities. */

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

/** Simple keychain test.
 *
 * Check for round-trip set/get, then remove.
 *
 * @param {string} key
 * @param {string} service
 * @param {string} value
 */
function test_keychain_trivial(key, service, value) {
    kc = get_keychain();
    var results = "";
    var keychainset_success_func =
        function(set_result) {
            results += "keychain set: " + set_result;
            kc.getForKey(function(gotval)
                               { results += "\nGet succeeded";
                                 if (gotval !== value) {
                                         results += ("but original :" + value
                                                     + ": !== result :"
                                                     + gotval + ":"); }
                                 kc.removeForKey(
                                     function() {
                                         results += "\nRemove succeeded.";
                                         alert(results); },
                                     function(err) {
                                         results += ("\nRemove failed, error"
                                                     + err);
                                         alert(results); },
                                     key, service); },
                               function(err) {
                                   results += ("\nGet failed, error" + err);
                                   alert(results); },
                               key, service); };
    kc.setForKey(keychainset_success_func,
                 function(err) { alert("keychain set failed, error: " + err); },
                 key, service, value);
}
