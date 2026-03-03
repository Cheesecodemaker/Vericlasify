"""
Shared pytest fixtures for Vericlasify Selenium tests.
"""

import pytest
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager


BASE_URL = "http://localhost:3001"


@pytest.fixture(scope="session")
def driver():
    """Chrome WebDriver — runs headless by default."""
    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1920,1080")

    service = Service(ChromeDriverManager().install())
    drv = webdriver.Chrome(service=service, options=opts)
    yield drv
    drv.quit()


@pytest.fixture
def wait(driver):
    """Explicit wait helper — 10 s timeout."""
    return WebDriverWait(driver, 10)


@pytest.fixture
def base_url():
    return BASE_URL
