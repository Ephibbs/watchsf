import base64
import os
from enum import Enum
from typing import Optional, Dict
import json
import requests

import openai
from fastapi import FastAPI, HTTPException, UploadFile, File
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

class EmergencyResponse(BaseModel):
    level: EmergencyLevel
    confidence: float
    reasoning: str
    recommended_action: str
    trigger: str  # e.g. '911', '311', or 'NONE'

class Report311Generator:
    def __init__(self, client: OpenAI):
        self.client = client
        self.base_url = "https://mobile311.sfgov.org/open311/v2"
        
    async def generate_report(self, situation: str, location: str, service_code: str) -> Dict:
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
                        "status": {"type": "string"}
                    },
                    "required": [
                        "description",
                        "address_string",
                        "lat",
                        "long",
                        "service_code",
                        "service_name",
                        "requested_datetime",
                        "status"
                    ],
                    "additionalProperties": False
                },
                "strict": True
            }

            print(f"Using schema: {json.dumps(report_schema, indent=2)}")

            prompt = f"""
            Create a detailed 311 report for San Francisco city services for the following situation:
            Situation: {situation}
            Location: {location}
            Service Code: {service_code}

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

            print(f"AI Response: {response.choices[0].message.content}")
            return json.loads(response.choices[0].message.content)

        except Exception as e:
            print(f"Error generating 311 report: {str(e)}")
            raise

    async def submit_to_311(self, report: Dict) -> Dict:
        """Submit the report to SF 311 API"""
        try:
            print("\n=== Submitting to 311 API ===")
            url = f"{self.base_url}/requests.json"
            
            print(f"Submitting report: {json.dumps(report, indent=2)}")
            
            # TODO: Add actual API key and authentication as required by SF 311
            response = requests.post(url, json=report)
            
            print(f"311 API Response: {response.text}")
            return response.json()

        except Exception as e:
            print(f"Error submitting to 311: {str(e)}")
            raise

@app.post("/evaluate", response_model=EmergencyResponse)
async def evaluate_emergency(request: EmergencyRequest):
    """
    This endpoint just classifies text-only situations
    using the 'o3-mini-2025-01-31' model with structured output.
    """
    try:
        print("\n=== Starting Emergency Evaluation ===")
        print(f"Input Text: {request.text}")
        print(f"Location: {request.location}")
        
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
        Text: {request.text}
        Location: {request.location if request.location else 'Not provided'}

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
            service_code = "input:Graffiti" if "graffiti" in request.text.lower() else "PW:BSM:Damage Property"
            
            report = await report_generator.generate_report(
                situation=request.text,
                location=request.location or "Unknown",
                service_code=service_code
            )
            
            # Submit to 311
            submission_result = await report_generator.submit_to_311(report)
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

@app.post("/evaluate-with-image", response_model=EmergencyResponse)
async def evaluate_emergency_with_image(
    text: str,
    location: Optional[str] = None,
    image: Optional[UploadFile] = File(None)
):
    """
    If an image is included, we first call the 'o1' vision model
    to get a short textual description of the image. Then we pass
    that combined info (text + image description + location) to
    the same 'o3-mini-2025-01-31' classification model with structured outputs.
    """
    try:
        image_description = ""
        if image:
            # Convert uploaded image to base64
            raw_image = await image.read()
            base64_image = base64.b64encode(raw_image).decode("utf-8")

            # Call the vision model to analyze the image
            # We'll keep it short for the classification prompt
            # If you need more detailed logic (e.g. detail="high"), add it below
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
                                "detail": "low"  # or "high"/"auto"
                            }
                        }
                    ],
                }
            ]

            vision_response = client.chat.completions.create(
                model="o1",  # Vision-capable model
                messages=vision_prompt,
            )

            image_description = vision_response.choices[0].message.content.strip()

        # Now build the classification prompt
        classification_prompt = f"""
        Evaluate the following situation with optional image context.
        Text: {text}
        Location: {location if location else 'Not provided'}
        Image summary: {image_description if image_description else 'No image provided'}

        Classification choices:
          1) EMERGENCY => call 911
          2) NON_EMERGENCY => call 311
          3) NO_CONCERN => do nothing

        Return your reasoning, recommended action, confidence, and the correct trigger
        ('911', '311', or 'NONE') as valid JSON only.
        """

        schema = {
            "name": "emergency_classification",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "level": {
                        "type": "string",
                        "enum": ["EMERGENCY", "NON_EMERGENCY", "NO_CONCERN"]
                    },
                    "confidence": {"type": "number"},
                    "reasoning": {"type": "string"},
                    "recommended_action": {"type": "string"},
                    "trigger": {"type": "string"},
                },
                "required": ["level", "confidence", "reasoning", "recommended_action", "trigger"],
                "additionalProperties": False,
            },
        }

        response = client.chat.completions.create(
            model="o3-mini-2025-01-31",
            messages=[
                {
                    "role": "system",
                    "content": "You are a helpful assistant that classifies emergencies."
                },
                {
                    "role": "user",
                    "content": classification_prompt
                }
            ],
            response_format={
                "type": "json_schema",
                "json_schema": schema
            }
        )

        choice = response.choices[0].message
        content = choice.content
        # Parse the JSON string into a dictionary
        parsed = json.loads(content)
        result = EmergencyResponse(
            level=parsed["level"],
            confidence=parsed["confidence"],
            reasoning=parsed["reasoning"],
            recommended_action=parsed["recommended_action"],
            trigger=parsed["trigger"],
        )
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
