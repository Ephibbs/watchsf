from flask import Flask, request, jsonify
import os

app = Flask(__name__)

@app.route('/requests', methods=['POST'])
def receive_report():
    print("\n=== Incoming 311 Report ===")
    
    # Print all form fields
    print("\nForm Data:")
    for field, value in request.form.items():
        print(f"  {field}: {value}")
    
    # Check for and save files
    files_received = 0
    if 'media' in request.files:
        files = request.files.getlist('media')
        print(f"\nFile Information:")
        
        for file in files:
            print(f"\nFile {files_received + 1}:")
            print(f"  Filename: {file.filename}")
            
            # Read and get file size
            file_data = file.read()
            file_size = len(file_data)
            print(f"  File size: {file_size} bytes")
            
            # Save the file
            save_path = "received_files"
            if not os.path.exists(save_path):
                os.makedirs(save_path)
                
            file_path = os.path.join(save_path, file.filename)
            with open(file_path, 'wb') as f:
                f.write(file_data)
            print(f"  Saved to: {file_path}")
            files_received += 1
    
    if files_received == 0:
        print("\nNo files received")
    else:
        print(f"\nTotal files received: {files_received}")
    
    print("\n=== End of Report ===\n")
    
    return jsonify({
        "status": "success", 
        "message": "Report received",
        "data": {
            "form_fields": dict(request.form),
            "files_received": files_received
        }
    })

if __name__ == '__main__':
    app.run(port=3001)