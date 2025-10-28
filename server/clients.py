from openai import OpenAI
from openai import AsyncOpenAI
from dotenv import load_dotenv
import pymongo
import os
import ssl
import certifi

load_dotenv()

# Configure MongoDB connection with TLS settings for Python 3.13 compatibility
# Python 3.13 uses OpenSSL 3.x which has stricter TLS defaults
mongo_conn_string = os.getenv("MONGO_CONN")

# Create a more permissive SSL context for Python 3.13 compatibility
ssl_context = ssl.create_default_context(cafile=certifi.where())
ssl_context.check_hostname = True
ssl_context.verify_mode = ssl.CERT_REQUIRED

# For OpenSSL 3.x, we need to allow legacy TLS protocols
# This is necessary for some MongoDB Atlas clusters
try:
    ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2
    ssl_context.maximum_version = ssl.TLSVersion.TLSv1_3
    # Use more permissive cipher settings for MongoDB Atlas
    ssl_context.set_ciphers('DEFAULT:@SECLEVEL=1')
    # Allow unsafe legacy renegotiation for older MongoDB versions
    ssl_context.options |= 0x4  # OP_LEGACY_SERVER_CONNECT
except Exception as e:
    print(f"Warning: Could not configure SSL context: {e}")

db_client = pymongo.MongoClient(
    mongo_conn_string,
    tls=True,
    tlsCAFile=certifi.where(),
    tlsAllowInvalidCertificates=True,  # Temporarily allow for debugging
    tlsAllowInvalidHostnames=True,     # Temporarily allow for debugging
    serverSelectionTimeoutMS=30000,  # Increased timeout
    connectTimeoutMS=30000,
    socketTimeoutMS=30000,
    retryWrites=True,
    w='majority',
    directConnection=False,  # Important for replica sets
)["today"]

openai_client = OpenAI()
