// Wait for document to be ready
document.addEventListener('DOMContentLoaded', function() {
  
  // Handle WhatsApp QR code polling
  const qrContainer = document.getElementById('qr-container');
  const statusContainer = document.getElementById('status-container');
  
  if (qrContainer && statusContainer) {
    // Poll for session status every 5 seconds
    const pollInterval = setInterval(() => {
      fetch('/whatsapp/status')
        .then(response => response.json())
        .then(data => {
          if (data.status === 'PENDING' && data.qr) {
            // Show QR code
            qrContainer.innerHTML = `<img src="${data.qr}" alt="WhatsApp QR Code" class="img-fluid">`;
            statusContainer.innerHTML = '<p class="alert alert-info">Scan this QR code with your WhatsApp app</p>';
          } else if (data.status === 'AUTHENTICATED' || data.status === 'READY') {
            // Authentication successful
            clearInterval(pollInterval);
            statusContainer.innerHTML = '<p class="alert alert-success">Successfully authenticated! Redirecting to contacts...</p>';
            setTimeout(() => {
              window.location.href = '/whatsapp/contacts';
            }, 2000);
          } else if (data.status === 'ERROR') {
            // Error occurred
            clearInterval(pollInterval);
            statusContainer.innerHTML = `<p class="alert alert-danger">Error: ${data.error}</p>`;
          }
        })
        .catch(error => {
          console.error('Error polling WhatsApp status:', error);
        });
    }, 5000);
  }
  
  // Handle contact selection in send message form
  const contactCheckboxes = document.querySelectorAll('.contact-checkbox');
  if (contactCheckboxes.length > 0) {
    contactCheckboxes.forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        const contactItem = this.closest('.contact-item');
        if (this.checked) {
          contactItem.classList.add('selected');
        } else {
          contactItem.classList.remove('selected');
        }
      });
    });
  }
  
  // Handle send message form
  const sendMessageForm = document.getElementById('send-message-form');
  if (sendMessageForm) {
    sendMessageForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const messageInput = document.getElementById('message');
      const selectedContacts = Array.from(
        document.querySelectorAll('.contact-checkbox:checked')
      ).map(checkbox => checkbox.value);
      
      if (selectedContacts.length === 0) {
        alert('Please select at least one contact');
        return;
      }
      
      if (!messageInput.value.trim()) {
        alert('Please enter a message');
        return;
      }
      
      const submitButton = document.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.innerHTML;
      submitButton.innerHTML = '<span class="loading-spinner"></span> Sending...';
      submitButton.disabled = true;
      
      const resultContainer = document.getElementById('send-result');
      
      // Send message using fetch API
      fetch('/whatsapp/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contacts: selectedContacts,
          message: messageInput.value
        })
      })
      .then(response => response.json())
      .then(data => {
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
        
        if (data.success) {
          // Count successful and failed messages
          const successCount = data.results.filter(r => r.success).length;
          const failedCount = data.results.length - successCount;
          
          let resultHTML = '<div class="alert ';
          if (failedCount === 0) {
            resultHTML += 'alert-success"><i class="fas fa-check-circle"></i> ';
            resultHTML += `Message sent successfully to ${successCount} contact${successCount !== 1 ? 's' : ''}`;
          } else if (successCount === 0) {
            resultHTML += 'alert-danger"><i class="fas fa-times-circle"></i> ';
            resultHTML += 'Failed to send message to any contacts';
          } else {
            resultHTML += 'alert-warning"><i class="fas fa-exclamation-triangle"></i> ';
            resultHTML += `Message sent to ${successCount} contact${successCount !== 1 ? 's' : ''}, but failed for ${failedCount}`;
          }
          resultHTML += '</div>';
          
          resultContainer.innerHTML = resultHTML;
          messageInput.value = '';
          
          // Uncheck all contacts
          document.querySelectorAll('.contact-checkbox:checked').forEach(checkbox => {
            checkbox.checked = false;
            checkbox.closest('.contact-item').classList.remove('selected');
          });
        } else {
          resultContainer.innerHTML = `<div class="alert alert-danger"><i class="fas fa-times-circle"></i> ${data.error}</div>`;
        }
      })
      .catch(error => {
        console.error('Error sending message:', error);
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
        resultContainer.innerHTML = '<div class="alert alert-danger"><i class="fas fa-times-circle"></i> Error sending message. Please try again.</div>';
      });
    });
  }
  
  // Handle AI test form
  const aiTestForm = document.getElementById('ai-test-form');
  if (aiTestForm) {
    aiTestForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const messageInput = document.getElementById('test-message');
      const submitButton = document.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.innerHTML;
      submitButton.innerHTML = '<span class="loading-spinner"></span> Generating...';
      submitButton.disabled = true;
      
      const responseContainer = document.getElementById('ai-response');
      responseContainer.innerHTML = '<div class="card-body text-center"><span class="loading-spinner"></span> Generating response...</div>';
      
      // Send test message to AI
      fetch('/ai/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: messageInput.value
        })
      })
      .then(response => response.json())
      .then(data => {
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
        
        if (data.success) {
          responseContainer.innerHTML = `
            <div class="card-header bg-success text-white">
              <h5><i class="fas fa-robot"></i> AI Response</h5>
            </div>
            <div class="card-body">
              <p>${data.response.replace(/\n/g, '<br>')}</p>
            </div>
          `;
        } else {
          responseContainer.innerHTML = `
            <div class="card-header bg-danger text-white">
              <h5><i class="fas fa-exclamation-triangle"></i> Error</h5>
            </div>
            <div class="card-body">
              <p>Failed to generate AI response: ${data.error}</p>
            </div>
          `;
        }
      })
      .catch(error => {
        console.error('Error testing AI:', error);
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
        responseContainer.innerHTML = `
          <div class="card-header bg-danger text-white">
            <h5><i class="fas fa-exclamation-triangle"></i> Error</h5>
          </div>
          <div class="card-body">
            <p>Error communicating with the AI service. Please try again.</p>
          </div>
        `;
      });
    });
  }
  
  // Handle AI settings form
  const aiSettingsForm = document.getElementById('ai-settings-form');
  if (aiSettingsForm) {
    aiSettingsForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const enabledInput = document.getElementById('ai-enabled');
      const autoReplyInput = document.getElementById('auto-reply');
      const submitButton = document.querySelector('button[type="submit"]');
      const originalButtonText = submitButton.innerHTML;
      submitButton.innerHTML = '<span class="loading-spinner"></span> Saving...';
      submitButton.disabled = true;
      
      // Save AI settings
      fetch('/ai/configure', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: enabledInput.checked,
          autoReply: autoReplyInput.checked
        })
      })
      .then(response => response.json())
      .then(data => {
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
        
        if (data.success) {
          // Show success message
          const alertContainer = document.createElement('div');
          alertContainer.className = 'alert alert-success mt-3';
          alertContainer.innerHTML = '<i class="fas fa-check-circle"></i> Settings saved successfully';
          
          aiSettingsForm.appendChild(alertContainer);
          
          // Remove alert after 3 seconds
          setTimeout(() => {
            alertContainer.remove();
          }, 3000);
        } else {
          // Show error message
          const alertContainer = document.createElement('div');
          alertContainer.className = 'alert alert-danger mt-3';
          alertContainer.innerHTML = `<i class="fas fa-times-circle"></i> ${data.error}`;
          
          aiSettingsForm.appendChild(alertContainer);
          
          // Remove alert after 5 seconds
          setTimeout(() => {
            alertContainer.remove();
          }, 5000);
        }
      })
      .catch(error => {
        console.error('Error saving AI settings:', error);
        submitButton.innerHTML = originalButtonText;
        submitButton.disabled = false;
        
        // Show error message
        const alertContainer = document.createElement('div');
        alertContainer.className = 'alert alert-danger mt-3';
        alertContainer.innerHTML = '<i class="fas fa-times-circle"></i> Error saving settings. Please try again.';
        
        aiSettingsForm.appendChild(alertContainer);
        
        // Remove alert after 5 seconds
        setTimeout(() => {
          alertContainer.remove();
        }, 5000);
      });
    });
  }
}); 