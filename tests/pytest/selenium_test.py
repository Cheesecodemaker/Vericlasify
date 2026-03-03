"""
Vericlasify — Selenium UI Tests
================================
Validates element presence, navigation, and form structure across all pages.
Requires only the Node.js server (`node server.js`) to be running on port 3001.
"""

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC


# ─────────────────────────────────────────────
#  1. DASHBOARD  (index.html)
# ─────────────────────────────────────────────

class TestDashboard:
    URL = "/"

    def _open(self, driver, base_url):
        driver.get(base_url + self.URL)

    # --- basic load ---
    def test_page_loads(self, driver, base_url, wait):
        self._open(driver, base_url)
        wait.until(EC.title_contains("Vericlasify"))
        assert "Dashboard" in driver.title

    def test_logo_visible(self, driver, base_url, wait):
        self._open(driver, base_url)
        logo = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, "h1.logo")))
        assert logo.text == "Vericlasify"

    def test_tagline_present(self, driver, base_url, wait):
        self._open(driver, base_url)
        tagline = wait.until(EC.visibility_of_element_located((By.ID, "tagline-text")))
        assert tagline.text  # non-empty

    # --- module toggle ---
    def test_blockchain_toggle_active_by_default(self, driver, base_url, wait):
        self._open(driver, base_url)
        btn = wait.until(EC.presence_of_element_located((By.ID, "btnBlockchain")))
        assert "active" in btn.get_attribute("class")

    def test_ai_toggle_switches_section(self, driver, base_url, wait):
        self._open(driver, base_url)
        ai_btn = wait.until(EC.element_to_be_clickable((By.ID, "btnAI")))
        ai_btn.click()
        ai_section = driver.find_element(By.ID, "aiSection")
        assert ai_section.is_displayed()

    def test_blockchain_section_has_nav_cards(self, driver, base_url, wait):
        self._open(driver, base_url)
        # click blockchain toggle to ensure section is visible
        bc_btn = wait.until(EC.element_to_be_clickable((By.ID, "btnBlockchain")))
        bc_btn.click()
        cards = driver.find_elements(By.CSS_SELECTOR, "#blockchainSection .command-card")
        # Should have: Create, Update, Stage, Close, Sync, CheckBC, CheckFile,
        #              Revert, Git, Encrypt, Export, Settings = 12
        assert len(cards) >= 10

    def test_status_bar_present(self, driver, base_url, wait):
        self._open(driver, base_url)
        status = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".status-bar")))
        assert status.is_displayed()
        version = driver.find_element(By.CSS_SELECTOR, ".status-version")
        assert "v1.0.0" in version.text


# ─────────────────────────────────────────────
#  2. CREATE PAGE  (create.html)
# ─────────────────────────────────────────────

class TestCreatePage:
    URL = "/create.html"

    def _open(self, driver, base_url):
        driver.get(base_url + self.URL)

    def test_page_title(self, driver, base_url, wait):
        self._open(driver, base_url)
        wait.until(EC.title_contains("Create"))
        assert "Create Storage Unit" in driver.title

    def test_form_fields_present(self, driver, base_url, wait):
        self._open(driver, base_url)
        for field_id in ["targetPath", "name", "remote", "description", "ethHost"]:
            el = wait.until(EC.presence_of_element_located((By.ID, field_id)))
            assert el.is_displayed(), f"Field #{field_id} not visible"

    def test_back_button_links_to_index(self, driver, base_url, wait):
        self._open(driver, base_url)
        back = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".back-btn")))
        assert "index.html" in back.get_attribute("href")

    def test_execute_button_present(self, driver, base_url, wait):
        self._open(driver, base_url)
        btn = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".execute-btn")))
        assert "Create Storage Unit" in btn.text

    def test_console_output_area(self, driver, base_url, wait):
        self._open(driver, base_url)
        console = wait.until(EC.presence_of_element_located((By.ID, "consoleBody")))
        assert console.is_displayed()


# ─────────────────────────────────────────────
#  3. STAGE PAGE  (stage.html)
# ─────────────────────────────────────────────

class TestStagePage:
    URL = "/stage.html"

    def _open(self, driver, base_url):
        driver.get(base_url + self.URL)

    def test_page_title(self, driver, base_url, wait):
        self._open(driver, base_url)
        wait.until(EC.title_contains("Stage"))
        assert "Stage" in driver.title

    def test_target_path_input(self, driver, base_url, wait):
        self._open(driver, base_url)
        inp = wait.until(EC.presence_of_element_located((By.ID, "targetPath")))
        assert inp.is_displayed()

    def test_execute_button(self, driver, base_url, wait):
        self._open(driver, base_url)
        btn = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".execute-btn")))
        assert "Stage" in btn.text

    def test_console_area(self, driver, base_url, wait):
        self._open(driver, base_url)
        console = wait.until(EC.presence_of_element_located((By.ID, "consoleBody")))
        assert console.is_displayed()


# ─────────────────────────────────────────────
#  4. SYNC PAGE  (sync.html)
# ─────────────────────────────────────────────

class TestSyncPage:
    URL = "/sync.html"

    def _open(self, driver, base_url):
        driver.get(base_url + self.URL)

    def test_page_title(self, driver, base_url, wait):
        self._open(driver, base_url)
        wait.until(EC.title_contains("Sync"))
        assert "Sync" in driver.title

    def test_form_fields(self, driver, base_url, wait):
        self._open(driver, base_url)
        for fid in ["targetPath", "ethHost"]:
            assert wait.until(EC.presence_of_element_located((By.ID, fid))).is_displayed()

    def test_eth_host_default(self, driver, base_url, wait):
        self._open(driver, base_url)
        eth = wait.until(EC.presence_of_element_located((By.ID, "ethHost")))
        assert eth.get_attribute("value") == "http://127.0.0.1:8545"

    def test_execute_button(self, driver, base_url, wait):
        self._open(driver, base_url)
        btn = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".execute-btn")))
        assert "Sync" in btn.text


# ─────────────────────────────────────────────
#  5. VERIFY BLOCKCHAIN PAGE  (checkbc.html)
# ─────────────────────────────────────────────

class TestCheckBCPage:
    URL = "/checkbc.html"

    def _open(self, driver, base_url):
        driver.get(base_url + self.URL)

    def test_page_title(self, driver, base_url, wait):
        self._open(driver, base_url)
        wait.until(EC.title_contains("Verify"))
        assert "Verify Blockchain" in driver.title

    def test_form_fields(self, driver, base_url, wait):
        self._open(driver, base_url)
        for fid in ["targetPath", "ethHost"]:
            assert wait.until(EC.presence_of_element_located((By.ID, fid))).is_displayed()

    def test_verify_button(self, driver, base_url, wait):
        self._open(driver, base_url)
        btn = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".execute-btn")))
        assert "Verify" in btn.text


# ─────────────────────────────────────────────
#  6. VERIFY FILE PAGE  (checkfile.html)
# ─────────────────────────────────────────────

class TestCheckFilePage:
    URL = "/checkfile.html"

    def _open(self, driver, base_url):
        driver.get(base_url + self.URL)

    def test_page_title(self, driver, base_url, wait):
        self._open(driver, base_url)
        wait.until(EC.title_contains("Verify File"))
        assert "Verify File" in driver.title

    def test_target_path_and_load_button(self, driver, base_url, wait):
        self._open(driver, base_url)
        inp = wait.until(EC.presence_of_element_located((By.ID, "targetPath")))
        assert inp.is_displayed()
        load = driver.find_element(By.CSS_SELECTOR, ".load-btn")
        assert "Load" in load.text

    def test_file_browser_hidden_initially(self, driver, base_url, wait):
        self._open(driver, base_url)
        browser = wait.until(EC.presence_of_element_located((By.ID, "fileBrowser")))
        assert not browser.is_displayed()

    def test_verify_button_disabled_initially(self, driver, base_url, wait):
        self._open(driver, base_url)
        btn = wait.until(EC.presence_of_element_located((By.ID, "verifyBtn")))
        assert not btn.is_enabled()


# ─────────────────────────────────────────────
#  7. ENCRYPT/DECRYPT PAGE  (encrypt.html)
# ─────────────────────────────────────────────

class TestEncryptPage:
    URL = "/encrypt.html"

    def _open(self, driver, base_url):
        driver.get(base_url + self.URL)

    def test_page_title(self, driver, base_url, wait):
        self._open(driver, base_url)
        wait.until(EC.title_contains("Encrypt"))
        assert "Encrypt" in driver.title

    def test_target_path_and_load(self, driver, base_url, wait):
        self._open(driver, base_url)
        inp = wait.until(EC.presence_of_element_located((By.ID, "targetPath")))
        assert inp.is_displayed()
        load = driver.find_element(By.CSS_SELECTOR, ".load-btn")
        assert load.is_displayed()

    def test_password_field_hidden_initially(self, driver, base_url, wait):
        self._open(driver, base_url)
        container = wait.until(EC.presence_of_element_located((By.ID, "passwordContainer")))
        assert not container.is_displayed()

    def test_action_buttons_hidden_initially(self, driver, base_url, wait):
        self._open(driver, base_url)
        actions = wait.until(EC.presence_of_element_located((By.ID, "actionButtons")))
        assert not actions.is_displayed()

    def test_info_box_mentions_aes(self, driver, base_url, wait):
        self._open(driver, base_url)
        info = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".info-box")))
        assert "AES-256" in info.text


# ─────────────────────────────────────────────
#  8. SETTINGS PAGE  (settings.html)
# ─────────────────────────────────────────────

class TestSettingsPage:
    URL = "/settings.html"

    def _open(self, driver, base_url):
        driver.get(base_url + self.URL)

    def test_page_title(self, driver, base_url, wait):
        self._open(driver, base_url)
        wait.until(EC.title_contains("Settings"))
        assert "Settings" in driver.title

    def test_wallet_form_fields(self, driver, base_url, wait):
        self._open(driver, base_url)
        for fid in ["wallet1", "pkey", "wallet2"]:
            el = wait.until(EC.presence_of_element_located((By.ID, fid)))
            assert el.is_displayed(), f"Field #{fid} not visible"

    def test_private_key_is_password_type(self, driver, base_url, wait):
        self._open(driver, base_url)
        pkey = wait.until(EC.presence_of_element_located((By.ID, "pkey")))
        assert pkey.get_attribute("type") == "password"

    def test_save_button(self, driver, base_url, wait):
        self._open(driver, base_url)
        btn = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, ".execute-btn")))
        assert "Save" in btn.text
