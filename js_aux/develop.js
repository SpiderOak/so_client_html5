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
 * ":test_keychain_trivial:" - elementary keychain plugin test
 */
SO_DEBUGGING = ":basic: :content_urls: -test_keychain_trivial -verbose";
