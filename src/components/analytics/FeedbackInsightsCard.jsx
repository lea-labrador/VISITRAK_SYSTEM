import { MessageSquare, FileText } from "lucide-react";

const FeedbackInsightsCard = ({ feedbacks, user, onIntegrate }) => {
  const withComments = feedbacks.filter(
    f => f.comment && f.comment !== "No comment provided"
  );

  return (
    <>
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-2">
          <MessageSquare size={20} />
          <h3 className="font-bold text-gray-800">Feedback Insights</h3>
        </div>

        <button
          onClick={onIntegrate}
          className="flex items-center gap-2 bg-[#553C9A] text-white px-4 py-2 rounded-lg text-sm"
        >
          <FileText size={16} />
          Integrate
        </button>
      </div>

      {withComments.length === 0 ? (
        <p className="text-center text-gray-500 py-6">
          No feedback with comments
        </p>
      ) : (
        <div className="space-y-4 max-h-80 overflow-y-auto">
          {withComments.map(f => (
            <div key={f.id} className="border-b pb-3">
              <h4 className="font-semibold">
                {f.visitorName}
                {user?.type === "SuperAdmin" && (
                  <span className="text-gray-400 ml-2">
                    ({f.visitorOffice})
                  </span>
                )}
              </h4>
              <p className="text-sm text-gray-600 mt-1">{f.comment}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default FeedbackInsightsCard;
