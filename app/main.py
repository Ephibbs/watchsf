import base64
import os
from enum import Enum
from typing import Optional, Dict
import json
import requests

import openai
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from dotenv import load_dotenv
from openai import OpenAI



# Load environment variables
load_dotenv()

# Initialize FastAPI
app = FastAPI()

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
    level: EmergencyLevel
    confidence: float
    reasoning: str
    recommended_action: str
    trigger: str  # e.g. '911', '311', or 'NONE'

class Report311Generator:
    def __init__(self, client: OpenAI):
        self.client = client
        # Use local test server instead of real SF 311
        self.base_url = "http://localhost:3000"
        
    async def generate_report(self, situation: str, location: str, service_code: str, image_data: Optional[bytes] = None, image_description: Optional[str] = None) -> Dict:
        """Generate a detailed 311 report using AI"""
        try:
            print("\n=== Generating 311 Report ===")
            
            # Simplified schema structure with required name field
            report_schema = {
                "name": "sf311_report",
                "schema": {
                    "type": "object",
                    "properties": {
                        "description": {"type": "string"},
                        "address_string": {"type": "string"},
                        "lat": {"type": "number", "nullable": True},
                        "long": {"type": "number", "nullable": True},
                        "service_code": {"type": "string"},
                        "service_name": {"type": "string"},
                        "requested_datetime": {"type": "string"},
                        "status": {"type": "string"},
                        "media_url": {"type": "string", "nullable": True},  # For image data
                        "image_description": {"type": "string", "nullable": True}  # AI description of image
                    },
                    "required": [
                        "description",
                        "address_string",
                        "lat",
                        "long",
                        "service_code",
                        "service_name",
                        "requested_datetime",
                        "status",
                        "media_url",
                        "image_description"
                    ],
                    "additionalProperties": False
                },
                "strict": True
            }

            # Include image information in the prompt if available
            image_context = f"\nImage Description: {image_description}" if image_description else ""
            
            prompt = f"""
            Create a detailed 311 report for San Francisco city services for the following situation:
            Situation: {situation}
            Location: {location}
            Service Code: {service_code}{image_context}

            Create a structured report with:
            1. Detailed description of the issue
            2. Exact location details
            3. Severity level
            4. Any relevant additional details
            5. Recommended priority

            Return as JSON with these fields:
            - description
            - address_string
            - lat (if available)
            - long (if available)
            - service_code
            - service_name
            - requested_datetime
            - status
            - media_url (if image available)
            - image_description (if available)
            """

            print(f"Prompt for report generation: {prompt}")

            response = self.client.chat.completions.create(
                model="o3-mini-2025-01-31",
                messages=[
                    {"role": "system", "content": "You are a detailed report writer for SF 311 services."},
                    {"role": "user", "content": prompt}
                ],
                response_format={
                    "type": "json_schema",
                    "json_schema": report_schema
                }
            )

            report_data = json.loads(response.choices[0].message.content)
            
            # If we have image data, encode it as base64
            if image_data:
                base64_image = base64.b64encode(image_data).decode('utf-8')
                report_data["media_url"] = f"data:image/jpeg;base64,{base64_image}"
            
            print(f"AI Response: {json.dumps(report_data, indent=2)}")
            return report_data

        except Exception as e:
            print(f"Error generating 311 report: {str(e)}")
            raise

    async def submit_to_311(self, report: Dict, image_data: Optional[bytes] = None) -> Dict:
        """Submit the report to test server following Open311 standard"""
        try:
            print("\n=== Submitting to Test Server ===")
            url = f"{self.base_url}/requests"  # Simplified endpoint for testing
            
            # Basic form fields required by Open311
            form_data = {
                'service_code': report['service_code'],
                'description': report['description'],
                'address_string': report['address_string'],
            }
            
            # Image attachment using Open311 'media' field
            files = {}
            if image_data:
                print(f"✓ Image data size: {len(image_data)} bytes")
                files = {
                    'media': ('report_image.jpg', image_data, 'image/jpeg')
                }
                print("✓ Image attached to request")
            else:
                print("✗ No image data to attach")
            
            print(f"Sending to URL: {url}")
            print(f"Form data: {json.dumps(form_data, indent=2)}")
            print(f"Files attached: {bool(files)}")
            
            response = requests.post(url, data=form_data, files=files)
            
            print(f"Test Server Response: {response.text}")
            return response.json()

        except Exception as e:
            print(f"Error submitting to test server: {str(e)}")
            raise

@app.post("/evaluate")
async def evaluate_emergency(
    text: str = Form(...),
    location: Optional[str] = Form(None),
    image: Optional[UploadFile] = File(None)
):
    """
    This endpoint classifies situations using the 'o3-mini-2025-01-31' model with structured output.
    """
    try:
        print("\n=== Starting Emergency Evaluation ===")
        print(f"Input Text: {text}")
        print(f"Location: {location}")

        # Initialize image_description and image_data
        image_description = ""
        image_data = None
        
        if image:
            print("\n=== Image Detected ===")
            print(f"Image: {image.filename}")
            
            # Read the image file once and store it
            image_data = await image.read()
            # Convert to base64 for vision model
            base64_image = base64.b64encode(image_data).decode('utf-8')
            
            # Call the vision model to analyze the image
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
                                "url": f"data:image/jpeg;base64,{base64_image}",
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

            image_description = vision_response.choices[0].message.content.strip()
        
        # We can supply a JSON schema so the model returns structured output.
        # Strict is True to ensure the model doesn't slip away from our format.
        # Make sure the root "required"/"properties" match exactly what we want returned.
        schema = {
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
        
        # Schema logging
        print("\n=== Schema Configuration ===")
        print(f"Schema: {json.dumps(schema, indent=2)}")
        
        prompt = f"""
        Evaluate the following situation and determine if it's an emergency:
        Text: {text}
        Location: {location if location else 'Not provided'}
        Image: {image_description if image_description else 'No image provided'}

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
                "json_schema": schema
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
        
        # Handle 311 cases
        if parsed["trigger"] == "311":
            print("\n=== Initiating 311 Report Generation ===")
            report_generator = Report311Generator(client)
            
            # For graffiti cases, use the specific service code
            service_code = "input:Graffiti" if "graffiti" in text.lower() else "PW:BSM:Damage Property"
            
            report = await report_generator.generate_report(
                situation=text,
                location=location or "Unknown",
                service_code=service_code,
                image_data=image_data,
                image_description=image_description
            )
            
            # Submit to 311 with the image
            submission_result = await report_generator.submit_to_311(report, image_data)
            print(f"311 Submission Result: {submission_result}")

        # Handle 911 cases
        elif parsed["trigger"] == "911":
            print("\n=== EMERGENCY 911 CASE DETECTED ===")
            # Here you would implement 911 notification logic
            # This might involve a different system or API
            pass

        # Creating response
        print("\n=== Creating Final Response ===")
        result = EmergencyResponse(
            level=parsed["level"],
            confidence=parsed["confidence"],
            reasoning=parsed["reasoning"],
            recommended_action=parsed["recommended_action"],
            trigger=parsed["trigger"],
        )
        print(f"Final Response: {result}")
        print("\n=== Evaluation Complete ===\n")
        
        return result

    except Exception as e:
        print(f"\n=== ERROR OCCURRED ===")
        print(f"Error type: {type(e)}")
        print(f"Error message: {str(e)}")
        print(f"Error details: {e.__dict__}")
        raise HTTPException(status_code=500, detail=str(e))