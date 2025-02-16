import base64
import os
from enum import Enum
from typing import Optional, Dict, List
import json
import requests
import wandb
from datetime import datetime

import openai
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI
from llama_index.core import VectorStoreIndex, Document



# Load environment variables
load_dotenv()

# Initialize FastAPI
app = FastAPI()

# Initialize W&B
wandb.init(
    project="emergency-response-system",
    config={
        "model": "o3-mini-2025-01-31",
        "api_version": "1.0"
    }
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://localhost:3000",  # Add HTTPS version
        "http://localhost:8000",
        "https://localhost:8000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure OpenAI
openai.api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI()

class EmergencyLevel(str, Enum):
    EMERGENCY = "EMERGENCY"
    NON_EMERGENCY = "NON_EMERGENCY"
    NO_CONCERN = "NO_CONCERN"

class EmergencyRequest(BaseModel):
    text: str
    location: Optional[str] = None
    
    class Config:
        arbitrary_types_allowed = True

class EmergencyResponse(BaseModel):
    level: str
    confidence: float
    reasoning: str
    recommended_action: str
    trigger: str
    needs_confirmation: bool
    report_data: Optional[Dict]
    images_base64: Optional[List[str]]

class Report311Generator:
    def __init__(self, client):
        self.client = client
        self.base_url = "http://localhost:3001"  # Test server URL

    async def generate_report(
        self,
        situation: str,  # This will now be the evaluation reasoning
        location: str,
        service_code: str,
        evaluation_level: str,
        evaluation_confidence: float,
        original_text: str,  # Adding original text for reference
        image_data: Optional[List[bytes]] = None,
        image_descriptions: Optional[List[str]] = None
    ) -> Dict:
        """Generate a 311 report with optional images"""
        try:
            # Generate a detailed report description using the evaluation output
            report_description = f"""
311 Report Details:
------------------
Evaluation Summary: {situation}
Confidence Level: {evaluation_confidence * 100:.1f}%
Classification: {evaluation_level}

Original Report: {original_text}
Location: {location}
Service Category: {service_code}

Additional Details:
- Date Reported: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
- Number of Images: {len(image_descriptions) if image_descriptions else 0}

Image Descriptions:
{chr(10).join([f"- Image {i+1}: {desc}" for i, desc in enumerate(image_descriptions)]) if image_descriptions else "No images provided"}

Assessment: Non-emergency incident requiring city services attention.
"""

            # Basic report structure
            report = {
                'service_code': service_code,
                'description': report_description.strip(),
                'address_string': location,
                'images': []
            }

            # Add image information if available
            if image_data and image_descriptions:
                for i, (img_data, img_desc) in enumerate(zip(image_data, image_descriptions)):
                    img_base64 = base64.b64encode(img_data).decode('utf-8')
                    report['images'].append({
                        'data': img_base64,
                        'description': img_desc,
                        'index': i
                    })
            
            print(f"Generated report with {len(report['images'])} images")
            return report

        except Exception as e:
            print(f"Error generating report: {str(e)}")
            raise

    async def submit_to_311(self, report: Dict, images_data: Optional[List[bytes]] = None) -> Dict:
        """Submit the report to test server following Open311 standard"""
        try:
            print("\n=== Submitting to Test Server ===")
            url = f"{self.base_url}/requests"
            
            form_data = {
                'service_code': report['service_code'],
                'description': report['description'],
                'address_string': report['address_string'],
            }
            
            # Handle multiple image attachments
            files = {}
            if images_data:
                print(f"✓ Processing {len(images_data)} images")
                # Send all images under the same 'media' key as a list
                for i, image_data in enumerate(images_data):
                    # Convert base64 back to binary if needed
                    if isinstance(image_data, str):
                        image_data = base64.b64decode(image_data)
                    files['media'] = (f'report_image_{i}.jpg', image_data, 'image/jpeg')
                print("✓ Images attached to request")
            else:
                print("✗ No images to attach")
            
            print(f"Sending to URL: {url}")
            print(f"Form data: {json.dumps(form_data, indent=2)}")
            print(f"Files attached: {len(files)}")
            
            response = requests.post(url, data=form_data, files=files)
            
            print(f"Test Server Response: {response.text}")
            return response.json()

        except Exception as e:
            print(f"Error submitting to test server: {str(e)}")
            raise

class Call911Service:
    def __init__(self):
        self.api_key = os.getenv("VAPI_API_KEY")
        self.base_url = "https://api.vapi.ai"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
    
    async def create_emergency_assistant(self, emergency_details: Dict) -> Dict:
        """Create an emergency assistant"""
        try:
            location = emergency_details.get("location", "unknown location")
            details = emergency_details.get("emergency_details", "")
            assistant_payload = {
                "name": "Emergency Assistant",
                "model": {
                    "provider": "openai",
                    "model": "gpt-4o",
                    "temperature": 1,
                    "messages": [
                        {
                            "role": "system",
                            "content": """You are an emergency reporting assistant. Your job is to:
                            1. Clearly and calmly report emergency situations to emergency services
                            2. Stay on the line until emergency services confirm they have all needed information
                            3. Be concise but thorough in your responses
                            
                            Remember to:
                            - Speak professionally and calmly
                            - Listen carefully to the operator's questions
                            - Provide location details when asked
                            - Confirm information when requested
                            - Don't end the call until the operator indicates they have everything they need"""
                        }
                    ],
                    "maxTokens": 250,
                    "temperature": 0.7
                },
                "voice": {
                    "provider": "11labs",
                    "voiceId": "burt",
                    "model": "eleven_turbo_v2_5"
                },
                "firstMessage": self._generate_emergency_script(emergency_details),
                "firstMessageMode": "assistant-speaks-first",
                "maxDurationSeconds": 300,  # 5 minutes max
                "silenceTimeoutSeconds": 10,
                "endCallMessage": "Thank you for your time. Emergency services have been notified.",
                "endCallPhrases": ["goodbye", "thank you for your time", "emergency services have been notified"]
            }
            
            # Create the assistant
            response = requests.post(
                f"{self.base_url}/assistant",
                headers=self.headers,
                json=assistant_payload
            )
            
            # Parse the response
            assistant_data = response.json()
            
            # Check if we got an ID back
            if "id" not in assistant_data:
                raise Exception(f"Failed to create assistant: {response.text}")
            
            print(f"Assistant created successfully with ID: {assistant_data['id']}")
            return await self.make_emergency_call(emergency_details, assistant_data["id"])
            
        except Exception as e:
            print(f"Error creating emergency assistant: {str(e)}")
            raise
    
    async def make_emergency_call(self, emergency_details: Dict, assistant_id: str) -> Dict:
        """Make an outbound call using the created assistant"""
        try:
            dummy_emergency_number = "+16502671201"  # Target number to call
            
            call_payload = {
                "name": "Emergency Call",
                "type": "outboundPhoneCall",
                "phoneNumberId": "690c63e0-0e3f-4db8-8538-40cf42a76099",
                "customer": {
                    "number": dummy_emergency_number,
                    "numberE164CheckEnabled": True
                },
                "assistantId": assistant_id  # Use the created assistant - it already has model and voice config
            }
            
            response = requests.post(
                f"{self.base_url}/call",
                headers=self.headers,
                json=call_payload
            )
            
            call_data = response.json()
            
            # Check if we got an ID back (successful call initiation)
            if "id" not in call_data:
                raise Exception(f"Failed to initiate emergency call: {response.text}")
            
            print(f"Emergency call initiated successfully with ID: {call_data['id']}")
            return call_data
            
        except Exception as e:
            print(f"Error making emergency call: {str(e)}")
            raise

    def _generate_emergency_script(self, emergency_details: Dict) -> str:
        """Generate the initial script for the emergency call"""
        location = emergency_details.get("location", "unknown location")
        details = emergency_details.get("emergency_details", "")
        
        return f"""
        Hello, {location}.
        The situation is as follows: {details}
        Please dispatch emergency services to this location immediately.
        I will stay on the line to provide any additional information you need.
        """

class EmergencyKnowledgeBase:
    def __init__(self):
        self.llm = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.index = self._create_index()
    
    def _create_index(self):
        # Create sample emergency guidelines documents
        documents = [
            Document(text="""
                Emergency (911) Criteria:
                - Immediate danger to life
                - someone is injured
                - someone is unconscious
                - danger to property
                - someone is in danger of harm
                - Active crimes in progress
                - Severe medical emergencies
                - Fire or smoke
                - Violence or threats of violence
                -   other emergency issues
            """),
            Document(text="""
                Non-Emergency (311) Criteria:
                - Graffiti removal
                - Damaged property
                - Noise complaints
                - Street cleaning
                - Illegal parking
                - other non-emergency issues
            """),
             Document(text="""
                Non-concern Criteria:
                - No emergency situation
                - regular situation 
                - be aware that user may misunderstand the situation
            """)
        ]
        return VectorStoreIndex.from_documents(documents)
    
    async def get_classification_context(self, situation: str) -> str:
        """Get relevant emergency guidelines for the situation"""
        query_engine = self.index.as_query_engine()
        response = query_engine.query(
            f"What guidelines are relevant for this situation: {situation}"
        )
        return str(response)

# Initialize the knowledge base
knowledge_base = EmergencyKnowledgeBase()

@app.post("/evaluate")
async def evaluate_emergency(
    text: str = Form(...),
    location: Optional[str] = Form(None),
    images: List[UploadFile] = File([])
):
    """
    This endpoint classifies situations using the 'o3-mini-2025-01-31' model with structured output.
    """
    print(f"Received text: {text}", f"Received location: {location}", f"Received images: {len(images) if images else 0}")
    try:
        # Start tracking this request
        run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        wandb.log({
            "request_id": run_id,
            "input_text": text,
            "location": location,
            "has_images": images is not None
        })

        print("\n=== Starting Emergency Evaluation ===")
        print(f"Input Text: {text}")
        print(f"Location: {location}")

        # Initialize lists for multiple images
        image_descriptions = []
        image_base64s = []
        
        if images and len(images) > 0:
            print("\n=== Images Detected ===")
            for image in images:
                print(f"Processing image: {image.filename}")
                
                # Read the image file and convert to base64
                image_data = await image.read()
                image_base64 = base64.b64encode(image_data).decode('utf-8')
                image_base64s.append(image_base64)
                
                # Reset file cursor for future reads
                await image.seek(0)
                
                # Call the vision model to analyze each image
                vision_prompt = [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": "Describe this image in a short, concise way for emergency classification:",
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_base64}",
                                    "detail": "low"
                                }
                            }
                        ],
                    }
                ]

                vision_response = client.chat.completions.create(
                    model="o1",
                    messages=vision_prompt,
                )

                image_descriptions.append(vision_response.choices[0].message.content.strip())

        # Get relevant context from LlamaIndex
        context = await knowledge_base.get_classification_context(text)
        
        prompt = f"""
        Use as an exapmple:
        {context}

        Evaluate the following situation and determine if it's an emergency:
        Text: {text}
        Location: {location if location else 'Not provided'}
        Images: {', '.join(image_descriptions) if image_descriptions else 'No images provided'}

        Classification choices:
          1) EMERGENCY => call 911
          2) NON_EMERGENCY => call 311
          3) NO_CONCERN => do nothing

        Return your reasoning, recommended action, confidence, and the correct trigger
        ('911', '311', or 'NONE'). Make sure you only respond with valid JSON.
        """
        
        # Prompt logging
        print("\n=== Prompt Sent to Model ===")
        print(prompt)
        
        # Before API call
        print("\n=== Making OpenAI API Call ===")
        response = client.chat.completions.create(
            model="o3-mini-2025-01-31",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that classifies emergencies."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "emergency_classification",
                    "strict": True,
                    "schema": {
                        "type": "object",
                        "properties": {
                            "level": {
                                "type": "string",
                                "description": "EMERGENCY, NON_EMERGENCY, or NO_CONCERN",
                                "enum": ["EMERGENCY", "NON_EMERGENCY", "NO_CONCERN"]
                            },
                            "confidence": {
                                "type": "number",
                                "description": "Confidence level from 0.0 to 1.0"
                            },
                            "reasoning": {
                                "type": "string",
                                "description": "Explanation of why the classification was chosen"
                            },
                            "recommended_action": {
                                "type": "string",
                                "description": "Advice for user or system on next steps"
                            },
                            "trigger": {
                                "type": "string",
                                "description": "Which service to trigger: '911', '311', or 'NONE'"
                            },
                        },
                        "required": ["level", "confidence", "reasoning", "recommended_action", "trigger"],
                        "additionalProperties": False,
                    },
                }
            }
        )
        
        # After API call
        print("\n=== Raw OpenAI Response ===")
        print(f"Response object: {response}")
        
        choice = response.choices[0].message
        content = choice.content
        print("\n=== Model Response Content ===")
        print(f"Content: {content}")
        
        # Parsing JSON
        print("\n=== Parsing JSON Response ===")
        parsed = json.loads(content)
        print(f"Parsed JSON: {json.dumps(parsed, indent=2)}")
        
        report_data = None
        images_base64s = None

        if parsed["trigger"] == "311":
            print("\n=== Generating 311 Report ===")
            report_generator = Report311Generator(client)
            
            service_code = "input:Graffiti" if "graffiti" in text.lower() else "PW:BSM:Damage Property"
            
            # Generate report using the evaluation output
            report_data = await report_generator.generate_report(
                situation=parsed["reasoning"],  # Use the AI's reasoning
                location=location or "Unknown",
                service_code=service_code,
                evaluation_level=parsed["level"],
                evaluation_confidence=parsed["confidence"],
                original_text=text,  # Include original text for reference
                image_data=[await image.read() for image in images] if images else None,
                image_descriptions=image_descriptions
            )
            
            result = EmergencyResponse(
                level=parsed["level"],
                confidence=parsed["confidence"],
                reasoning=parsed["reasoning"],
                recommended_action="Would you like to submit a 311 report for this issue?",
                trigger=parsed["trigger"],
                needs_confirmation=True,
                report_data=report_data,
                images_base64=image_base64s
            )

        elif parsed["trigger"] == "911":
            print("\n=== Preparing 911 Response ===")
            emergency_details = {
                "emergency_details": text,
                "location": location
            }
            
            needs_confirmation = True  # Change this to True if you want confirmation flow
            
            if needs_confirmation:
                # Confirmation flow
                result = EmergencyResponse(
                    level=parsed["level"],
                    confidence=parsed["confidence"],
                    reasoning=parsed["reasoning"],
                    recommended_action="This appears to be an emergency. Would you like us to contact 911?",
                    trigger=parsed["trigger"],
                    needs_confirmation=True,
                    report_data=emergency_details,
                    images_base64=image_base64s
                )
            else:
                # Immediate action flow
                emergency_service = Call911Service()
                call_result = await emergency_service.create_emergency_assistant(emergency_details)
                
                result = EmergencyResponse(
                    level=parsed["level"],
                    confidence=parsed["confidence"],
                    reasoning=parsed["reasoning"],
                    recommended_action="Emergency services have been contacted.",
                    trigger=parsed["trigger"],
                    needs_confirmation=False,
                    report_data={"emergency_details": text, "location": location, "call_result": call_result},
                    images_base64=image_base64s
                )

        else:  # NO_CONCERN case
            print("\n=== Preparing NO_CONCERN Response ===")
            print("✓ No action needed")
            print("✓ Confirmation needed: False")
            print("✓ Recommended action: No action needed. This situation does not require emergency services or city services.")
            
            result = EmergencyResponse(
                level=parsed["level"],
                confidence=parsed["confidence"],
                reasoning=parsed["reasoning"],
                recommended_action="No action needed. This situation does not require emergency services or city services.",
                trigger=parsed["trigger"],
                needs_confirmation=False,
                report_data=None,
                images_base64=None
            )
        
        print("\n=== Final Response Summary ===")
        print(f"Level: {result.level}")
        print(f"Trigger: {result.trigger}")
        print(f"Needs Confirmation: {result.needs_confirmation}")
        print(f"Recommended Action: {result.recommended_action}")
        print(f"Report Data Included: {bool(result.report_data)}")
        print(f"Images Included: {bool(result.images_base64)}")
        
        # Log model response
        wandb.log({
            "request_id": run_id,
            "classification_level": parsed["level"],
            "confidence": parsed["confidence"],
            "trigger": parsed["trigger"],
        })

        if images:
            for i, image_description in enumerate(image_descriptions):
                wandb.log({
                    "request_id": run_id,
                    "image_description": image_description
                })

        # Log final result
        wandb.log({
            "request_id": run_id,
            "final_level": result.level,
            "needs_confirmation": result.needs_confirmation,
            "has_report_data": result.report_data is not None
        })

        return result

    except Exception as e:
        print(f"Error in evaluate_emergency: {str(e)}")  # Add detailed error logging
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        # Log errors
        wandb.log({
            "request_id": run_id if 'run_id' in locals() else None,
            "error": str(e),
            "error_type": type(e).__name__,
            "traceback": traceback.format_exc()
        })
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/confirm-311")
async def confirm_311_report(
    report_data: str = Form(...),
    images: List[UploadFile] = File(None)
):
    try:
        report_data = json.loads(report_data)
        
        # Handle multiple images
        images_data = []
        if images:
            for image in images:
                contents = await image.read()
                images_data.append(contents)
        
        report_generator = Report311Generator(client)
        submission_result = await report_generator.submit_to_311(report_data, images_data)
        
        return {
            "status": "success",
            "message": "311 report submitted successfully",
            "submission": submission_result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/confirm-911")
async def confirm_911_call(emergency_details: Dict):
    try:
        emergency_details = emergency_details.get("report_data")
        emergency_service = Call911Service()
        # Create assistant and make the call
        call_result = await emergency_service.create_emergency_assistant(emergency_details)
        
        return {
            "status": "success",
            "message": "Emergency services have been notified",
            "call_details": call_result,
            "emergency_info": {
                "emergency_text": emergency_details.get("emergency_details"),
                "location": emergency_details.get("location")
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Add cleanup on app shutdown
@app.on_event("shutdown")
async def shutdown_event():
    wandb.finish()