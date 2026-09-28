import asyncio
from bson import ObjectId
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from db.connection import MongoDB
from db.collections import stockclosing_collection
from core.compute import ist_now

async def main():
    MongoDB.connect()
    col = stockclosing_collection()
    
    # The ID from the user
    doc_id_str = "6a1328c7e8856ba80c57bb33"
    
    try:
        doc_id = ObjectId(doc_id_str)
    except Exception:
        doc_id = doc_id_str # fallback to string if they store it as string
        
    doc = await col.find_one({"_id": doc_id})
    
    if not doc:
        print(f"Could not find document with _id {doc_id}")
    else:
        now = ist_now()
        # Set date to the format used in their system.
        # From the snippet: "date": "2026-07-10T22:05:18.880160+05:30"
        now_str = now.isoformat()
        
        print(f"Found document. Current date: {doc.get('date')}")
        result = await col.update_one(
            {"_id": doc_id}, 
            {"$set": {"date": now_str}}
        )
        print(f"Modified {result.modified_count} document(s). Set date to {now_str}")
        
    MongoDB.close()

if __name__ == "__main__":
    asyncio.run(main())
